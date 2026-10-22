import { retryPlaceWhenIdle } from './place-resource-queue';

export type BackgroundTask = { run: () => Promise<unknown> };

// One small unit at a time; foreground queues and hidden/offline pages take precedence.
export function startBackgroundTasks(
  tasks: BackgroundTask[],
  signal: AbortSignal,
) {
  const waiting = tasks.map((task) => ({ ...task, at: 0, attempt: 0 }));
  let cancel: (() => void) | undefined;
  let blockedUntil = 0;
  const schedule = () => {
    if (signal.aborted || !waiting.length) return;
    waiting.sort((a, b) => a.at - b.at);
    const job = waiting.shift()!;
    cancel = retryPlaceWhenIdle(
      () => {
        if (signal.aborted) return;
        void Promise.resolve()
          .then(job.run)
          .then((result) => {
            if (signal.aborted || !Array.isArray(result)) return;
            for (const task of result)
              if (typeof task?.run === 'function')
                waiting.push({ ...task, at: 0, attempt: 0 });
          })
          .catch((error) => {
            if (signal.aborted || error?.name === 'AbortError') return;
            if (error?.status === 429 || error?.status === 503)
              blockedUntil =
                Date.now() + (error.status === 429 ? 60000 : 15000);
            if (job.attempt < 2) {
              job.attempt++;
              job.at = Date.now() + (job.attempt === 1 ? 10000 : 60000);
              waiting.push(job);
            }
          })
          .finally(schedule);
      },
      Math.max(300, job.at - Date.now(), blockedUntil - Date.now()),
    );
  };
  const stop = () => cancel?.();
  signal.addEventListener('abort', stop, { once: true });
  schedule();
  return () => {
    stop();
    signal.removeEventListener('abort', stop);
  };
}
