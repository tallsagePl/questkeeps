import { setTimeout as delay } from 'node:timers/promises';

type Task = { name: string; intervalMs: number; run: () => Promise<void> };

export async function runWorkerLoops(
  tasks: Task[],
  signal: AbortSignal,
  onError: (name: string, error: unknown) => void,
) {
  await Promise.all(
    tasks.map(async (task) => {
      while (!signal.aborted) {
        try {
          await task.run();
        } catch (error) {
          onError(task.name, error);
        }
        if (signal.aborted) break;
        try {
          await delay(task.intervalMs, undefined, { signal });
        } catch (error) {
          if (!signal.aborted) throw error;
        }
      }
    }),
  );
}
