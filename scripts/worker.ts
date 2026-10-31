import { runMetadataJobs } from '../lib/metadata-jobs';
import { pollTelegram, deliverTelegram } from '../lib/telegram';
import { deliverEmails } from '../lib/email-verification';
import { syncDue } from '../lib/sync';
import { runWorkerLoops } from '../lib/worker-loops';

const shutdown = new AbortController();

process.on('SIGINT', () => shutdown.abort());

process.on('SIGTERM', () => shutdown.abort());

console.log(
  'QuestKeeps: email queue every 5 seconds; Drive synchronization every 15 minutes',
);

void runWorkerLoops(
  [
    { name: 'telegram-poll', intervalMs: 1000, run: pollTelegram },
    { name: 'telegram-delivery', intervalMs: 1000, run: deliverTelegram },
    {
      name: 'email',
      intervalMs: 5000,
      run: async () => {
        const result = await deliverEmails();
        if (result.sent || result.failed)
          console.log(
            new Date().toISOString(),
            'email',
            JSON.stringify(result),
          );
      },
    },
    {
      name: 'metadata',
      intervalMs: 5000,
      run: async () => {
        await runMetadataJobs(shutdown.signal);
      },
    },
    {
      name: 'sync',
      intervalMs: 30000,
      run: async () => {
        const result = await syncDue(shutdown.signal);
        if (result.length)
          console.log(new Date().toISOString(), 'sync', JSON.stringify(result));
      },
    },
  ],
  shutdown.signal,
  (name, error) => console.error(name, error),
).catch((error) => {
  console.error('Worker stopped', error);
  process.exitCode = 1;
});
