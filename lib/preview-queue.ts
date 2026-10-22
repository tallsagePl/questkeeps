type Job = {
  key: string;
  task: (signal: AbortSignal) => Promise<Blob>;
  consumers: Map<symbol, number>;
  promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
  controller?: AbortController;
  preempted: boolean;
  finished: boolean;
};

export const PREVIEW_TIMEOUT_MS = 20000;

function runPreviewTask(job: Job, controller: AbortController): Promise<Blob> {
  let onAbort!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException('Preview request timed out', 'TimeoutError'),
    );
  }, PREVIEW_TIMEOUT_MS);
  return Promise.race([
    Promise.resolve().then(() => job.task(controller.signal)),
    interrupted,
  ]).finally(() => {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  });
}

const jobs = new Map<string, Job>();

const running = new Set<Job>();

const rank = (job: Job) => Math.min(...job.consumers.values());

let scheduled = false;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    pump();
  });
}

function pump() {
  const waiting = [...jobs.values()]
    .filter((j) => !j.finished && !running.has(j))
    .sort((a, b) => rank(a) - rank(b));
  for (const job of waiting) {
    if (running.size >= 6) {
      if (rank(job) === 0) {
        const background = [...running].find(
          (j) => rank(j) > 0 && !j.preempted,
        );
        if (background) {
          background.preempted = true;
          background.controller?.abort();
        }
      }
      break;
    }
    // Leave network capacity for the screen, instead of filling it with neighbors.
    if (rank(job) > 0 && [...running].filter((j) => rank(j) > 0).length >= 2)
      continue;
    const controller = new AbortController();
    job.controller = controller;
    job.preempted = false;
    running.add(job);
    void runPreviewTask(job, controller)
      .then((blob) => {
        if (!job.finished && !job.preempted) {
          job.finished = true;
          jobs.delete(job.key);
          job.resolve(blob);
        }
      })
      .catch((error) => {
        if (!job.finished && !job.preempted) {
          job.finished = true;
          jobs.delete(job.key);
          job.reject(error);
        }
      })
      .finally(() => {
        running.delete(job);
        schedule();
      });
  }
}

export function queuePreview(
  key: string,
  priority: number,
  task: (signal: AbortSignal) => Promise<Blob>,
) {
  let job = jobs.get(key);
  if (!job) {
    let resolve!: Job['resolve'];
    let reject!: Job['reject'];
    const promise = new Promise<Blob>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    job = {
      key,
      task,
      consumers: new Map(),
      promise,
      resolve,
      reject,
      preempted: false,
      finished: false,
    };
    jobs.set(key, job);
  }
  const current = job;
  const consumer = Symbol();
  current.consumers.set(consumer, priority);
  schedule();
  return {
    promise: current.promise,
    setPriority(value: number) {
      if (!current.finished) {
        current.consumers.set(consumer, value);
        schedule();
      }
    },
    release() {
      current.consumers.delete(consumer);
      if (!current.consumers.size && !current.finished) {
        current.finished = true;
        if (jobs.get(key) === current) jobs.delete(key);
        current.controller?.abort();
        current.reject(
          new DOMException('Preview no longer in view', 'AbortError'),
        );
        schedule();
      }
    },
  };
}

export const previewQueueBusy = (foregroundOnly = false) =>
  [...jobs.values()].some(
    (job) => !job.finished && (!foregroundOnly || rank(job) < 2),
  );
