type Job = {
  priority: number;
  run: () => Promise<unknown>;
  signal: AbortSignal;
  resolve: (value: any) => void;
  reject: (error: unknown) => void;
};

const waiting: Job[] = [];

let active = 0;

function drain() {
  waiting.sort((a, b) => a.priority - b.priority);
  while (active < 2 && waiting.length) {
    const job = waiting.shift()!;
    if (job.signal.aborted) {
      job.reject(new DOMException('Cancelled', 'AbortError'));
      continue;
    }
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

// Only queued work is cancelled. In-flight work can finish and populate the shared cache.
export function queuePlaceDescription<T>(
  run: () => Promise<T>,
  signal: AbortSignal,
  priority = 0,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const job: Job = {
      run,
      signal,
      priority,
      resolve: (value) => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      },
      reject: (error) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    };
    const cancel = () => {
      const index = waiting.indexOf(job);
      if (index >= 0) {
        waiting.splice(index, 1);
        job.reject(new DOMException('Cancelled', 'AbortError'));
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    waiting.push(job);
    drain();
  });
}
