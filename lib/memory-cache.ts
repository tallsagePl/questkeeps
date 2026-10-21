export const CACHE_TTL = 15 * 60 * 1000;
export class MemoryCache<K, V> extends Map<K, V> {
  private expiry = new Map<
    K,
    { at: number; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private ttl = CACHE_TTL,
    private limit = 1000,
  ) {
    super();
  }
  override set(key: K, value: V): this {
    this.delete(key);
    if (this.size >= this.limit) this.delete(this.keys().next().value!);
    super.set(key, value);
    const timer = setTimeout(() => this.delete(key), this.ttl);
    (timer as unknown as { unref?: () => void }).unref?.();
    this.expiry.set(key, { at: Date.now() + this.ttl, timer });
    return this;
  }
  override get(key: K): V | undefined {
    const entry = this.expiry.get(key);
    if (entry && entry.at <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    return super.get(key);
  }
  override has(key: K): boolean {
    this.get(key);
    return super.has(key);
  }
  override delete(key: K): boolean {
    const entry = this.expiry.get(key);
    if (entry) clearTimeout(entry.timer);
    this.expiry.delete(key);
    return super.delete(key);
  }
  override clear(): void {
    for (const entry of this.expiry.values()) clearTimeout(entry.timer);
    this.expiry.clear();
    super.clear();
  }
}
