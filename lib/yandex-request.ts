// Read-only provider requests may be replayed before a response is handed off.
// Keep this module independent of the database so failure policies can be tested.
export const YANDEX_OPEN_TIMEOUT_MS = 25000;

const transientCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);

type Stage = 'metadata' | 'file';

type Policy = { attemptMs?: number; retryDelayMs?: number };

export class YandexRequestError extends Error {
  constructor(
    public reason: 'timeout' | 'network' | 'http',
    public upstreamStatus?: number,
  ) {
    super('Yandex request ' + reason);
    this.name = 'YandexRequestError';
  }
}

function networkCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return;
  const value = error as { code?: string; cause?: unknown };
  return (
    (typeof value.code === 'string' ? value.code : undefined) ||
    networkCode(value.cause)
  );
}

export async function withYandexDeadline<T>(
  parent: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = YANDEX_OPEN_TIMEOUT_MS,
): Promise<T> {
  parent?.throwIfAborted();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Yandex deadline', 'TimeoutError')),
    timeoutMs,
  );
  const signal = parent
    ? AbortSignal.any([parent, controller.signal])
    : controller.signal;
  try {
    return await operation(signal);
  } catch (error) {
    // Caller cancellation must never turn into another upstream request.
    if (parent?.aborted) throw parent.reason;
    if (controller.signal.aborted) throw new YandexRequestError('timeout');
    const code = networkCode(error);
    if (code && transientCodes.has(code))
      throw new YandexRequestError('network');
    throw error;
  } finally {
    // After headers are returned, a long video is governed by the caller signal,
    // not by the deadline for opening it.
    clearTimeout(timer);
  }
}

function wait(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function yandexGet<T>(
  url: string | URL,
  init: RequestInit & { signal: AbortSignal },
  stage: Stage,
  read: (response: Response) => Promise<T>,
  policy: Policy = {},
): Promise<T> {
  if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()))
    throw new TypeError('Only read-only Yandex requests can be retried');
  const attemptMs = policy.attemptMs ?? 10000;
  for (let attempt = 0; attempt < 2; attempt++) {
    init.signal.throwIfAborted();
    const controller = new AbortController();
    const signal = AbortSignal.any([init.signal, controller.signal]);
    const timer = setTimeout(
      () =>
        controller.abort(new DOMException('Yandex attempt', 'TimeoutError')),
      attemptMs,
    );
    let delay = policy.retryDelayMs ?? 250;
    try {
      const response = await fetch(url, {
        ...init,
        signal,
        redirect: 'manual',
      });
      if (transientStatuses.has(response.status)) {
        await response.body?.cancel();
        // Do not hammer a rate-limited provider. A long Retry-After is surfaced
        // immediately; the UI can retry later instead of sleeping past its budget.
        const value = response.headers.get('retry-after');
        if (value) {
          const seconds = Number(value);
          const retryMs = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(value) - Date.now();
          if (Number.isFinite(retryMs)) {
            if (retryMs > 2000)
              throw new YandexRequestError('http', response.status);
            delay = Math.max(delay, retryMs);
          }
        }
        if (attempt) throw new YandexRequestError('http', response.status);
        console.warn('Yandex retry', {
          stage,
          reason: 'http',
          status: response.status,
        });
      } else {
        return await read(response);
      }
    } catch (error) {
      if (init.signal.aborted) throw init.signal.reason;
      if (error instanceof YandexRequestError) throw error;
      const code = networkCode(error);
      const timedOut = controller.signal.aborted;
      if (!timedOut && (!code || !transientCodes.has(code))) throw error;
      if (attempt) {
        console.warn('Yandex request failed', {
          stage,
          reason: timedOut ? 'timeout' : 'network',
          code,
        });
        throw new YandexRequestError(timedOut ? 'timeout' : 'network');
      }
      console.warn('Yandex retry', {
        stage,
        reason: timedOut ? 'timeout' : 'network',
        code,
      });
    } finally {
      clearTimeout(timer);
    }
    await wait(delay, init.signal);
  }
  throw new YandexRequestError('network');
}
