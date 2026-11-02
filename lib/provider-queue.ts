import { setTimeout as delay } from 'node:timers/promises';

type Entry = { priority: number; run: () => Promise<void>; cancel: () => void };

// Deadlines include waiting in the queue, transfer and JSON parsing.
export class ProviderQueue {
  private entries: Entry[] = [];
  private running = false;
  private next = 0;
  constructor(
    private spacing: number,
    private capacity = 64,
  ) {}
  request<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeout: number,
    signal?: AbortSignal,
    priority = 0,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (this.entries.length >= this.capacity)
      return Promise.reject(
        Object.assign(Error('Provider queue full'), { code: 'QUEUE_FULL' }),
      );
    const lifetime = AbortSignal.any([
      AbortSignal.timeout(timeout),
      ...(signal ? [signal] : []),
    ]);
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const settle = (error: unknown, value?: T) => {
        if (finished) return;
        finished = true;
        lifetime.removeEventListener('abort', entry.cancel);
        if (error) reject(error);
        else resolve(value as T);
      };
      const entry: Entry = {
        priority,
        cancel: () => {
          const index = this.entries.indexOf(entry);
          if (index >= 0) this.entries.splice(index, 1);
          settle(lifetime.reason || new DOMException('Aborted', 'AbortError'));
        },
        run: async () => {
          try {
            lifetime.throwIfAborted();
            const wait = this.next - Date.now();
            if (wait > 0) await delay(wait, undefined, { signal: lifetime });
            lifetime.throwIfAborted();
            this.next = Date.now() + this.spacing;
            const result = await task(lifetime);
            lifetime.throwIfAborted();
            settle(null, result);
          } catch (error) {
            settle(error);
          }
        },
      };
      lifetime.addEventListener('abort', entry.cancel, { once: true });
      this.entries.push(entry);
      void this.drain();
    });
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.entries.length) {
        this.entries.sort((a, b) => a.priority - b.priority);
        await this.entries.shift()!.run();
      }
    } finally {
      this.running = false;
    }
  }
}

export async function boundedProviderJson(
  response: Response,
  signal: AbortSignal,
  limit = 8 * 1024 * 1024,
) {
  if (Number(response.headers.get('content-length') || 0) > limit) {
    await response.body?.cancel();
    throw Error('Provider response too large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty provider response');
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > limit) throw Error('Provider response too large');
      parts.push(next.value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
  signal.throwIfAborted();
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
