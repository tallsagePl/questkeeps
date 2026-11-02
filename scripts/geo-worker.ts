import { runGeoJob } from '../lib/geo-jobs';
import { runWorkerLoops } from '../lib/worker-loops';
import { startWorkerHealth } from '../lib/worker-health';

const stop = new AbortController();

process.on('SIGTERM', () => stop.abort());

process.on('SIGINT', () => stop.abort());

const health = startWorkerHealth('geo');

try {
  await runWorkerLoops(
    [{ name: 'geometry', intervalMs: 1000, run: () => runGeoJob(stop.signal) }],
    stop.signal,
    () => {},
    health.event,
  );
} finally {
  health.close();
}
