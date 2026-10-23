# Telegram feedback bot

The background worker runs the bot with long polling; no public webhook or extra inbound port is required. Run exactly one Telegram worker per token. Local development and production must not poll the same bot simultaneously.

## Private configuration

Create a bot with [@BotFather](https://t.me/BotFather), then configure the ignored `.env.local` or private deployment environment:

```dotenv
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_ID=
EMAIL_SUPPORT_URL=https://t.me/YOUR_BOT_USERNAME
```

Use the administrator's numeric user ID, not a username or group ID. Never commit real values. Every admin action checks the sender ID and private chat. Only the configured administrator can read registration emails and process feedback.

Run `npm run backup`, `npm run migrate`, `npm run telegram:setup`, and restart `npm run dev` or `npm start` to load the settings. Setup configures the name, description and commands, and refuses to proceed when an existing webhook is configured. The administrator must open the bot and press **Start** before Telegram permits registration notifications.

## Behavior

- Ordinary users receive a Russian welcome message. Text, photos with captions, videos, documents and voice messages are accepted. Albums are stored as individual feedback messages. A sender can submit up to 30 pending messages per hour.
- Admin has two inline buttons: **Feedback** and **Новые пользователи**, with ten items per page. The user list exposes only email addresses; provider accounts without email are labeled accordingly.
- Each feedback item has a **Feedback обработан** button. Processing deletes its content and attachment references from the active database and removes the bot's review messages. Long text can span two messages. Telegram may refuse deletion of old messages; the bot then removes their action buttons. Database backups follow the operator's retention policy.
- Registration notifications are queued atomically with password or Yandex account creation, including accounts awaiting email verification. They contain only the email. Login and account linking do not notify; historical registrations are not sent when enabling the bot.

Feedback bodies, file references and outgoing jobs are encrypted with `TOKEN_ENCRYPTION_KEY`. Sender IDs are stored only as hashes for submission limits. Photos are not downloaded to the application server. Keep the encryption key when migrating the database.

The update cursor and response queue survive restarts. Outgoing jobs use leases and backoff and respect Telegram `retry_after`. A crash after Telegram accepts a message but before SQLite acknowledges it can produce a duplicate: the Bot API has no send-message idempotency key. Notifications remain queued while the admin has not started the bot or has blocked it.

`npm run health` reports configuration flags and queue counts without exposing secrets or message content. Telegram 409 in worker logs usually indicates a competing poller or existing webhook. Stop the local poller before enabling production.

## Проверка после запуска

1. Администратор отправляет `/start` и видит две кнопки.
2. Другой аккаунт отправляет текст и фотографию, получает подтверждение. Админские разделы ему недоступны.
3. Администратор открывает Feedback и обрабатывает отзыв. Он исчезает из списка.
4. Регистрация нового аккаунта присылает администратору email. Повторный вход уведомление не создаёт.

Automated tests use isolated databases, fictional IDs and mocked transport; they never connect to the real bot.

Disable the local bot with `TELEGRAM_ENABLED=false` before enabling production. The public bilingual policy is at https://questkeeps.ru/privacy; set this URL in BotFather. Upload `public/brand/telegram-avatar.png` as Botpic and `public/brand/telegram-description.png` as Description picture.
