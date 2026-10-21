import { previewQueueBusy } from './preview-queue';
const waiting: {
  run: () => Promise<unknown>;
  priority: number;
  key?: string;
  resolve: (value: any) => void;
  reject: (error: unknown) => void;
}[] = [];
let active = 0;
let background = 0;
function drain() {
  while (active < 4 && waiting.length) {
    waiting.sort((a, b) => a.priority - b.priority);
    const index = waiting.findIndex(
      (job) => job.priority < 2 || background < 2,
    );
    if (index < 0) break;
    const job = waiting.splice(index, 1)[0];
    active++;
    if (job.priority >= 2) background++;
    void Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        if (job.priority >= 2) background--;
        drain();
      });
  }
}
export function queuePlaceResource<T>(
  run: () => Promise<T>,
  priority = 0,
  key?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    waiting.push({ run, resolve, reject, priority, key });
    drain();
  });
}
export function promotePlaceResource(key: string) {
  const job = waiting.find((job) => job.key === key);
  if (job) {
    job.priority = 0;
    drain();
  }
}
const retries = new Set<{ run: () => void; at: number }>();
let timer: ReturnType<typeof setTimeout> | undefined;
function checkIdle() {
  timer = undefined;
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    navigator.onLine &&
    active === background &&
    !waiting.some((job) => job.priority < 2) &&
    !previewQueueBusy(true)
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
