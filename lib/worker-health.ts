import { mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

type Loop = {
  started: number;
  success: number;
  failures: number;
  running: boolean;
  error: string | null;
};

export function workerHealthPath(role: string) {
  if (!['worker', 'geo', 'video'].includes(role))
    throw Error('Invalid worker role');
  return join(
    dirname(process.env.DATABASE_PATH || './data/travel.sqlite'),
    'worker-health',
    role + '.json',
  );
}

export function startWorkerHealth(role: string) {
  const path = workerHealthPath(role);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const loops: Record<string, Loop> = {};
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  const flush = () => {
    try {
      const temporary = path + '.' + process.pid + '.tmp';
      writeFileSync(
        temporary,
        JSON.stringify({
          role,
          release: process.env.QK_RELEASE_ID || 'local',
          at: Date.now(),
          loops,
          lagMeanMs: Number.isFinite(lag.mean) ? lag.mean / 1e6 : 0,
          lagMaxMs: lag.max / 1e6,
        }),
        { mode: 0o600 },
      );
      renameSync(temporary, path);
      lag.reset();
    } catch {
      /* A failed heartbeat becomes stale and fails the container check. */
    }
  };
  flush();
  const timer = setInterval(flush, 20000);
  timer.unref();
  return {
    event(
      name: string,
      phase: 'start' | 'success' | 'failure',
      error?: unknown,
    ) {
      const loop = (loops[name] ||= {
        started: 0,
        success: 0,
        failures: 0,
        running: false,
        error: null,
      });
      if (phase === 'start') {
        loop.started = Date.now();
        loop.running = true;
      } else {
        loop.running = false;
        if (phase === 'success') {
          loop.success = Date.now();
          loop.error = null;
        } else {
          loop.failures++;
          loop.error = error instanceof Error ? error.name : 'Error';
        }
      }
    },
    close() {
      clearInterval(timer);
      lag.disable();
    },
    flush,
  };
}

export function readWorkerHealth(role: string) {
  const value = JSON.parse(readFileSync(workerHealthPath(role), 'utf8'));
  const alive =
    value.role === role &&
    Number.isFinite(value.at) &&
    Date.now() - value.at < 90000 &&
    value.at <= Date.now() + 5000 &&
    (!process.env.QK_RELEASE_ID || value.release === process.env.QK_RELEASE_ID);
  return { ...value, alive };
}
