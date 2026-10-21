import { previewQueueBusy } from './preview-queue';
const waiting: {
  run: () => Promise<unknown>;
  resolve: (value: any) => void;
  reject: (error: unknown) => void;
}[] = [];
let active = 0;
function drain() {
  while (active < 4 && waiting.length) {
    const job = waiting.shift()!;
    active++;
    void Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        drain();
      });
  }
}
export function queuePlaceResource<T>(run: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    waiting.push({ run, resolve, reject });
    drain();
  });
}
const retries = new Set<{ run: () => void; at: number }>();
let timer: ReturnType<typeof setTimeout> | undefined;
function checkIdle() {
  timer = undefined;
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    navigator.onLine &&
    !active &&
    !waiting.length &&
    !previewQueueBusy()
  ) {
    const job = [...retries].find((item) => item.at <= Date.now());
    if (job) {
      retries.delete(job);
      job.run();
    }
  }
  if (retries.size) timer = setTimeout(checkIdle, 500);
}
// A bounded second pass waits behind all foreground place and preview requests.
export function retryPlaceWhenIdle(run: () => void, delay: number) {
  const job = { run, at: Date.now() + delay };
  retries.add(job);
  if (!timer) timer = setTimeout(checkIdle, 500);
  return () => {
    retries.delete(job);
    if (!retries.size && timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}
