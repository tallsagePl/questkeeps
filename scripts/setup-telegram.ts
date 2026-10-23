import { telegramCall, telegramConfigured } from '../lib/telegram';

if (!telegramConfigured())
  throw Error(
    'Configure TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_ID privately first.',
  );

const me = await telegramCall('getMe');

const webhook = await telegramCall('getWebhookInfo');

if (webhook.url)
  throw Error(
    'This bot already has a webhook. Remove it before enabling the polling worker.',
  );

await telegramCall('setMyName', { name: 'QuestKeeps' });

await telegramCall('setMyDescription', {
  description:
    'Истории путешествий становятся лучше благодаря вам 💙 Расскажите, что нравится в QuestKeeps, предложите идею или сообщите об ошибке. Можно отправить текст, фотографии, видео и файлы. https://questkeeps.ru',
});

await telegramCall('setMyShortDescription', {
  short_description:
    'Обратная связь QuestKeeps 💙 Идеи, отзывы и помощь: https://questkeeps.ru',
});

await telegramCall('setMyCommands', {
  commands: [
    { command: 'start', description: 'Начать и открыть меню' },
    { command: 'feedback', description: 'Как оставить отзыв' },
  ],
});

console.log('Telegram bot configured: https://t.me/' + me.username);
