import { readWorkerHealth } from '../lib/worker-health';

try {
  const health = readWorkerHealth(
    process.argv[2] || process.env.QK_WORKER_ROLE || 'worker',
  );
  if (!health.alive) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
