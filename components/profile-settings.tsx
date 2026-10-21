'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';
import {
  ApiError,
  FeedbackForm,
  FeedbackButton,
  Field,
  useFeedback,
} from './feedback';
import UserAvatar, { type ProfileUser } from './user-avatar';
import { ConnectedAccount } from './account-picker';
type Account = { id: string; label: string };
export default function ProfileSettings({
  user,
  accounts,
  yandexEnabled,
  onUserChange,
  onAccountsChange,
}: {
  user: ProfileUser;
  accounts: Account[];
  yandexEnabled: boolean;
  onUserChange: (user: ProfileUser) => void;
  onAccountsChange: (accounts: Account[]) => void;
}) {
  const { t } = useLocale();
  const feedback = useFeedback();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState(user.username || '');
  const [message, setMessage] = useState('');
  const [editingName, setEditingName] = useState(false);
  const nickname = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editingName) {
      const input =
        nickname.current?.querySelector<HTMLInputElement>('input[name="name"]');
      input?.focus();
      input?.select();
    } else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editingName;
  }, [editingName]);
  async function perform(task: () => Promise<void>) {
    const scope = feedback.active.current;
    feedback.clear();
    setMessage('');
    setBusy(true);
    try {
      await task();
    } catch (error) {
      feedback.report(error, scope);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="profile-settings stack"
      aria-label={t('Настройки профиля')}
    >
      <div className="profile-identity">
        <UserAvatar user={user} large />
        <div ref={nickname} className="profile-nickname">
          {editingName ? (
            <FeedbackForm
              className="stack profile-name-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = new FormData(event.currentTarget).get('name');
                void perform(async () => {
                  onUserChange((await api('me', 'PATCH', { name })).user);
                  setMessage('Никнейм сохранён');
                  setEditingName(false);
                });
              }}
            >
              <Field
                label={t('Никнейм')}
                name="name"
                defaultValue={user.name}
                required
                maxLength={80}
                autoComplete="nickname"
              />
              <div className="profile-name-actions">
                <FeedbackButton
                  type="submit"
                  className="primary"
                  disabled={busy}
                >
                  {t(busy ? 'Сохраняем…' : 'Сохранить никнейм')}
                </FeedbackButton>
                <FeedbackButton
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    feedback.clear();
                    setMessage('');
                    setEditingName(false);
                  }}
                >
                  {t('Отмена')}
                </FeedbackButton>
              </div>
            </FeedbackForm>
          ) : (
            <div className="profile-name-display">
              <strong>{user.name}</strong>
              <button
                ref={editButton}
                type="button"
                className="icon-button nickname-edit"
                disabled={busy}
                aria-label={t('Изменить никнейм')}
                title={t('Изменить никнейм')}
                onClick={() => {
                  feedback.clear();
                  setMessage('');
                  setEditingName(true);
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" />
                </svg>
              </button>
            </div>
          )}
          {user.email && <p className="muted">{user.email}</p>}
        </div>
      </div>
      <FeedbackForm
        className="stack profile-handle-form"
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            const result = await api('me', 'PATCH', { username: handle });
            onUserChange(result.user);
            setHandle(result.user.username);
            setMessage('Юзернейм сохранён');
          });
        }}
      >
        <Field
          label={t('Юзернейм')}
          name="username"
          value={handle}
          onChange={(event) => setHandle(event.target.value.replace(/^@/, ''))}
          minLength={3}
          maxLength={30}
          required
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
        />
        <p className="field-hint">
          {t(
            'Уникальное имя для упоминаний: латинские буквы, цифры и подчёркивания.',
          )}
        </p>
        {user.username && (
          <a
            className="profile-short-link"
            href={'/@' + user.username}
            target="_blank"
            rel="noopener noreferrer"
          >
            /@{user.username} ↗
          </a>
        )}
        <FeedbackButton
          className="secondary"
          disabled={busy || handle === user.username}
        >
          {t('Сохранить юзернейм')}
        </FeedbackButton>
      </FeedbackForm>
      <div className="profile-avatar-actions">
        <input
          ref={file}
          type="file"
          tabIndex={-1}
          accept="image/jpeg,image/png,image/webp"
          aria-label={t('Файл аватарки')}
          className="avatar-file-input"
          disabled={busy}
          onChange={(event) => {
            const image = event.target.files?.[0];
            event.target.value = '';
            if (!image) return;
            void perform(async () => {
              if (image.size > 5 * 1024 * 1024)
                throw new ApiError('Фотография должна быть не больше 5 МБ');
              const response = await fetch('/api/me/avatar', {
                method: 'PUT',
                headers: { 'Content-Type': image.type },
                body: image,
              });
              const value = await response
                .json()
                .catch(() => ({ error: t('Не удалось загрузить аватарку') }));
              if (!response.ok)
                throw new ApiError(
                  value.error || 'Не удалось загрузить аватарку',
                );
              onUserChange(value.user);
              setMessage('Аватарка обновлена');
            });
          }}
        />
        <FeedbackButton
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          {t(user.avatarVersion ? 'Заменить фото' : 'Загрузить своё фото')}
        </FeedbackButton>
        {user.avatarVersion && (
          <FeedbackButton
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                onUserChange((await api('me/avatar', 'DELETE')).user);
                setMessage('Своя аватарка удалена');
              })
            }
          >
            {t('Удалить своё фото')}
          </FeedbackButton>
        )}
      </div>
      <p className="field-hint">
        {t(
          'JPG, PNG или WebP · до 5 МБ. Своё фото заменяет аватарку профиля; на Диске остаётся аватарка Яндекса.',
        )}
      </p>

      <p className="profile-status" role="status" aria-live="polite">
        {t(message)}
      </p>
      <h3>{t('Аккаунт Яндекса')}</h3>
      {accounts.map((account) => (
        <div className="profile-yandex stack" key={account.id}>
          <ConnectedAccount account={account} />
          <p className="field-hint">
            {t(
              'Отключение остановит синхронизацию. Фотографии с Диска станут доступны после повторного подключения.',
            )}
          </p>
          <div className="profile-connection-actions">
            <FeedbackButton
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const result = await api('accounts/' + account.id, 'DELETE');
                  onUserChange(result.user);
                  onAccountsChange(accounts.filter((a) => a.id !== account.id));
                  setMessage('Аккаунт Яндекса отключён');
                })
              }
            >
              {t('Отключить Яндекс')}
            </FeedbackButton>
            <a className="text-button" href="/api/auth/yandex?intent=link">
              {t('Обновить разрешения')}
            </a>
          </div>
        </div>
      ))}
      {!accounts.length &&
        !user.yandexAccountId &&
        (yandexEnabled ? (
          <a className="secondary centered" href="/api/auth/yandex?intent=link">
            {t('Подключить аккаунт Яндекса')}
          </a>
        ) : (
          <p className="muted">
            {t('Подключение Яндекс Диска ещё не настроено.')}
          </p>
        ))}
    </section>
  );
}
