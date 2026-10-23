import { db, one, all, run, id, hash, encrypt, decrypt } from './db';

type Parameters = Record<string, any>;

type Button = { text: string; callback_data: string };

type Job = { method: string; params: Parameters; feedback?: string };

export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    /^\d+$/.test(process.env.TELEGRAM_ADMIN_ID || ''),
  );
}

function admin() {
  return process.env.TELEGRAM_ADMIN_ID!;
}

export class TelegramError extends Error {
  constructor(
    public code: number,
    public retryAfter = 0,
  ) {
    super('Telegram request failed (' + code + ')');
  }
}

export async function telegramCall(method: string, params: Parameters = {}) {
  let response: Response;
  try {
    response = await fetch(
      'https://api.telegram.org/bot' +
        process.env.TELEGRAM_BOT_TOKEN +
        '/' +
        method,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(35000),
      },
    );
  } catch {
    throw new TelegramError(0);
  }
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new TelegramError(response.status);
  }
  if (!response.ok || !result.ok)
    throw new TelegramError(
      result.error_code || response.status,
      result.parameters?.retry_after || 0,
    );
  return result.result;
}

function queue(
  method: string,
  params: Parameters,
  feedback?: string,
  key = id(),
) {
  run(
    'INSERT OR IGNORE INTO telegram_outbox(id,payload,feedback_id,available) VALUES (?,?,?,?)',
    key,
    encrypt(JSON.stringify({ method, params, feedback })),
    feedback || null,
    Date.now(),
  );
}

function say(
  chat: string | number,
  text: string,
  buttons?: Button[][],
  feedback?: string,
) {
  queue(
    'sendMessage',
    {
      chat_id: chat,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    },
    feedback,
  );
}

export function queueTelegramRegistration(userId: string) {
  if (!telegramConfigured()) return;
  const user = one('SELECT email FROM users WHERE id=?', userId);
  queue(
    'sendMessage',
    {
      chat_id: admin(),
      text:
        'Новый пользователь QuestKeeps\n' + (user?.email || 'Email не указан'),
    },
    undefined,
    'registration:' + userId,
  );
}

function menu(chat: string | number) {
  say(chat, 'QuestKeeps · Режим администратора', [
    [
      { text: 'Feedback', callback_data: 'feedback:0' },
      { text: 'Новые пользователи', callback_data: 'users:0' },
    ],
  ]);
}

function pageButtons(kind: string, offset: number, hasMore: boolean) {
  const buttons: Button[] = [];
  if (offset > 0)
    buttons.push({
      text: '← Назад',
      callback_data: kind + ':' + Math.max(0, offset - 10),
    });
  if (hasMore)
    buttons.push({
      text: 'Далее →',
      callback_data: kind + ':' + (offset + 10),
    });
  return [buttons, [{ text: 'Меню', callback_data: 'menu' }]].filter(
    (row) => row.length,
  );
}

function feedbackPage(offset: number) {
  const rows = all(
    'SELECT * FROM telegram_feedback ORDER BY created DESC,id DESC LIMIT 11 OFFSET ?',
    offset,
  );
  for (const row of rows.slice(0, 10)) {
    const item = JSON.parse(decrypt(row.payload));
    const buttons = [
      [{ text: 'Feedback обработан', callback_data: 'done:' + row.id }],
    ];
    const content =
      'Feedback · ' +
      new Date(row.created).toLocaleString('ru-RU', { timeZone: 'UTC' }) +
      ' UTC\n\n' +
      (item.text || 'Вложение');
    if (item.method && content.length <= 1000) {
      queue(
        item.method,
        {
          chat_id: admin(),
          [item.field]: item.file,
          caption: content,
          reply_markup: { inline_keyboard: buttons },
        },
        row.id,
      );
      continue;
    }
    let part = '';
    for (const character of content) {
      if (part.length + character.length > 3900) {
        say(admin(), part, buttons, row.id);
        part = '';
      }
      part += character;
    }
    if (part) say(admin(), part, buttons, row.id);
    if (item.method)
      queue(
        item.method,
        {
          chat_id: admin(),
          [item.field]: item.file,
          reply_markup: { inline_keyboard: buttons },
        },
        row.id,
      );
  }
  say(
    admin(),
    rows.length
      ? 'Отзывы · страница ' + (offset / 10 + 1)
      : 'Необработанных отзывов пока нет.',
    pageButtons('feedback', offset, rows.length > 10),
  );
}

function usersPage(offset: number) {
  const rows = all(
    'SELECT email FROM users ORDER BY created DESC,id DESC LIMIT 11 OFFSET ?',
    offset,
  );
  say(
    admin(),
    'Последние регистрации · страница ' +
      (offset / 10 + 1) +
      '\n\n' +
      (rows
        .slice(0, 10)
        .map((row) => row.email || 'Email не указан')
        .join('\n') || 'Пока нет пользователей.'),
    pageButtons('users', offset, rows.length > 10),
  );
}

// All effects and the update cursor are committed together, so a replay is harmless.
export function acceptTelegramUpdate(update: Parameters) {
  db.transaction(() => {
    const offset = Number(
      one('SELECT value FROM telegram_state WHERE key=?', 'offset')?.value || 0,
    );
    if (!Number.isSafeInteger(update.update_id) || update.update_id < offset)
      return;
    const callback = update.callback_query;
    const message = callback?.message || update.message;
    const sender = callback?.from || message?.from;
    if (
      message?.chat?.type === 'private' &&
      sender &&
      !sender.is_bot &&
      String(message.chat.id) === String(sender.id)
    ) {
      const isAdmin = String(sender.id) === admin();
      if (isAdmin)
        run(
          'INSERT OR REPLACE INTO telegram_state VALUES (?,?)',
          'admin_started',
          'true',
        );
      if (callback) {
        queue('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: isAdmin ? undefined : 'Нет доступа.',
        });
        if (isAdmin) {
          const data = String(callback.data || '');
          if (data === 'menu') menu(admin());
          const page = /^(feedback|users):(\d{1,7})$/.exec(data);
          if (page)
            (page[1] === 'feedback' ? feedbackPage : usersPage)(
              Number(page[2]),
            );
          const done = /^done:([A-Za-z0-9_-]{24})$/.exec(data);
          if (done) {
            const feedbackId = done[1];
            const messages = all(
              'SELECT message_id FROM telegram_feedback_messages WHERE feedback_id=?',
              feedbackId,
            );
            run('DELETE FROM telegram_outbox WHERE feedback_id=?', feedbackId);
            run('DELETE FROM telegram_feedback WHERE id=?', feedbackId);
            for (const row of messages)
              queue('deleteMessage', {
                chat_id: admin(),
                message_id: row.message_id,
              });
            say(admin(), 'Feedback обработан и удалён.');
          }
        }
      } else if (isAdmin) {
        menu(admin());
      } else if (
        /^\/(start|help|feedback)(?:@\w+)?(?:\s|$)/.test(message.text || '')
      ) {
        say(
          sender.id,
          'Привет! Это бот обратной связи QuestKeeps — сервиса, который сохраняет истории путешествий.\n\nРасскажи, что нравится, чего не хватает или что пошло не так. Просто отправь сообщение, фотографию, видео или файл — мы всё прочитаем. Подпись к фотографии тоже сохранится.\n\nНе отправляй пароли и другие секреты. Наш сайт: https://questkeeps.ru',
        );
      } else {
        const attachment = message.photo?.at(-1)
          ? {
              method: 'sendPhoto',
              field: 'photo',
              file: message.photo.at(-1).file_id,
            }
          : message.document
            ? {
                method: 'sendDocument',
                field: 'document',
                file: message.document.file_id,
              }
            : message.video
              ? {
                  method: 'sendVideo',
                  field: 'video',
                  file: message.video.file_id,
                }
              : message.voice
                ? {
                    method: 'sendVoice',
                    field: 'voice',
                    file: message.voice.file_id,
                  }
                : {};
        const text = Array.from(String(message.text || message.caption || ''))
          .slice(0, 4096)
          .join('');
        const senderHash = hash(String(sender.id));
        const recent = one(
          'SELECT count(*) AS n FROM telegram_feedback WHERE sender_hash=? AND created>?',
          senderHash,
          Date.now() - 3600000,
        );
        if (recent!.n >= 30)
          say(
            sender.id,
            'Спасибо за отзывы! Сейчас небольшая пауза: попробуй отправить следующее сообщение через час.',
          );
        else if (text || 'file' in attachment) {
          run(
            'INSERT INTO telegram_feedback VALUES (?,?,?,?)',
            id(),
            senderHash,
            encrypt(JSON.stringify({ text, ...attachment })),
            Date.now(),
          );
          say(
            sender.id,
            'Спасибо! Твой отзыв сохранён и попадёт к команде QuestKeeps 💙',
          );
        } else
          say(
            sender.id,
            'Пожалуйста, отправь текст, фото, видео, голосовое сообщение или файл.',
          );
      }
    }
    run(
      'INSERT OR REPLACE INTO telegram_state VALUES (?,?)',
      'offset',
      String(update.update_id + 1),
    );
  }).immediate();
}

export async function pollTelegram() {
  if (!telegramConfigured()) return;
  const offset = Number(
    one('SELECT value FROM telegram_state WHERE key=?', 'offset')?.value || 0,
  );
  const updates = await telegramCall('getUpdates', {
    offset,
    timeout: 20,
    limit: 30,
    allowed_updates: ['message', 'callback_query'],
  });
  for (const update of updates) acceptTelegramUpdate(update);
  run(
    'INSERT OR REPLACE INTO telegram_state VALUES (?,?)',
    'last_poll_at',
    String(Date.now()),
  );
}

export async function deliverTelegram() {
  if (!telegramConfigured()) return;
  for (let i = 0; i < 10; i++) {
    const row = db
      .transaction(() => {
        const job = one(
          'SELECT * FROM telegram_outbox WHERE available<=? AND lease_until<? ORDER BY available,id LIMIT 1',
          Date.now(),
          Date.now(),
        );
        if (job)
          run(
            'UPDATE telegram_outbox SET lease_until=? WHERE id=?',
            Date.now() + 60000,
            job.id,
          );
        return job;
      })
      .immediate();
    if (!row) return;
    const job: Job = JSON.parse(decrypt(row.payload));
    try {
      const result = await telegramCall(job.method, job.params);
      db.transaction(() => {
        if (
          job.feedback &&
          result?.message_id &&
          one('SELECT id FROM telegram_feedback WHERE id=?', job.feedback)
        )
          run(
            'INSERT OR IGNORE INTO telegram_feedback_messages VALUES (?,?)',
            job.feedback,
            result.message_id,
          );
        if (
          job.feedback &&
          result?.message_id &&
          !one('SELECT id FROM telegram_feedback WHERE id=?', job.feedback)
        )
          queue('deleteMessage', {
            chat_id: admin(),
            message_id: result.message_id,
          });
        run('DELETE FROM telegram_outbox WHERE id=?', row.id);
      })();
    } catch (error) {
      if (
        error instanceof TelegramError &&
        error.code === 400 &&
        job.method === 'deleteMessage'
      ) {
        // Telegram cannot delete messages older than 48h. Remove the actionable button instead.
        queue('editMessageReplyMarkup', {
          ...job.params,
          reply_markup: { inline_keyboard: [] },
        });
        run('DELETE FROM telegram_outbox WHERE id=?', row.id);
      } else if (
        error instanceof TelegramError &&
        error.code === 400 &&
        ['answerCallbackQuery', 'editMessageReplyMarkup'].includes(job.method)
      ) {
        run('DELETE FROM telegram_outbox WHERE id=?', row.id);
      } else {
        const wait =
          error instanceof TelegramError && error.retryAfter
            ? error.retryAfter * 1000
            : Math.min(3600000, 5000 * 2 ** Math.min(row.attempts, 10));
        run(
          'UPDATE telegram_outbox SET available=?,attempts=attempts+1,lease_until=0 WHERE id=?',
          Date.now() + wait,
          row.id,
        );
        return;
      }
    }
  }
}
