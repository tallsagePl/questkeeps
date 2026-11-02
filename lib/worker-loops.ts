import { setTimeout as delay } from 'node:timers/promises';

type Task = { name: string; intervalMs: number; run: () => Promise<void> };

export async function runWorkerLoops(
  tasks: Task[],
  signal: AbortSignal,
  onError: (name: string, error: unknown) => void,
  observe?: (
    name: string,
    phase: 'start' | 'success' | 'failure',
    error?: unknown,
  ) => void,
) {
  await Promise.all(
    tasks.map(async (task) => {
      let failures = 0;
      while (!signal.aborted) {
        try {
          observe?.(task.name, 'start');
          await task.run();
          failures = 0;
          observe?.(task.name, 'success');
        } catch (error) {
          failures++;
          observe?.(task.name, 'failure', error);
          onError(task.name, error);
        }
        if (signal.aborted) break;
        try {
          await delay(
            failures
              ? Math.min(
                  60000,
                  Math.max(task.intervalMs, 1000) *
                    2 ** Math.min(failures - 1, 6),
                )
              : task.intervalMs,
            undefined,
            { signal },
          );
        } catch (error) {
          if (!signal.aborted) throw error;
        }
      }
    }),
  );
}
