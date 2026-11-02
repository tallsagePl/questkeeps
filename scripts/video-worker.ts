import { startWorkerHealth } from '../lib/worker-health';
import { setTimeout as delay } from 'node:timers/promises';
import { runVideoJob, closeVideoStore, videoStore } from '../lib/video-jobs';
import { videoCommand } from '../lib/video-convert';

process.umask(0o077);

const shutdown = new AbortController();

process.on('SIGINT', () => shutdown.abort());

process.on('SIGTERM', () => shutdown.abort());

await videoCommand(
  process.env.FFMPEG_PATH || 'ffmpeg',
  ['-version'],
  shutdown.signal,
  10000,
);

console.log('QuestKeeps video worker ready: one 720p job at a time');

const health = startWorkerHealth('video');

const heartbeat = setInterval(() => {
  try {
    videoStore().tick();
  } catch {}
}, 20000);

try {
  while (!shutdown.signal.aborted) {
    try {
      health.event('prepare', 'start');
      await runVideoJob(shutdown.signal);
      health.event('prepare', 'success');
    } catch (error) {
      health.event('prepare', 'failure', error);
      if (!shutdown.signal.aborted)
        console.warn('Video worker waiting for cache');
    }
    try {
      await delay(2000, undefined, { signal: shutdown.signal });
    } catch {
      break;
    }
  }
} finally {
  clearInterval(heartbeat);
  health.close();
  closeVideoStore();
}
