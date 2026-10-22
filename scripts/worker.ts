import { deliverEmails } from '../lib/email-verification';
import { syncDue } from '../lib/sync';
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
async function main() {
  console.log('QuestKeeps: синхронизация каждые 15 минут');
  while (!stopped) {
    try {
      await deliverEmails();
      const result = await syncDue();
      if (result.length)
        console.log(new Date().toISOString(), JSON.stringify(result));
    } catch (error) {
      console.error(error);
    }
    for (let i = 0; i < 30 && !stopped; i++)
      await new Promise((r) => setTimeout(r, 1000));
  }
}
void main();
