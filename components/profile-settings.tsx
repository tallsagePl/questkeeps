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
  const { t, m } = useLocale();
  const feedback = useFeedback();
  const file = useRef<HTMLInputElement>(null);
  const avatarEdit = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState(user.username || '');
  const [message, setMessage] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const handleInput = useRef<HTMLDivElement>(null);
  const handleButton = useRef<HTMLButtonElement>(null);
  const handleWasEditing = useRef(false);
  useEffect(() => {
    if (editingHandle) handleInput.current?.querySelector('input')?.focus();
    else if (handleWasEditing.current) handleButton.current?.focus();
    handleWasEditing.current = editingHandle;
  }, [editingHandle]);
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
      aria-label={t('profile.profileSettings')}
    >
      <div className="profile-identity">
        <div className="profile-avatar-editor">
          <UserAvatar user={user} large />
          <button
            type="button"
            ref={avatarEdit}
            className="icon-button avatar-edit"
            aria-label={t('profile.editProfilePhoto')}
            aria-expanded={editingAvatar}
            onClick={() => setEditingAvatar(!editingAvatar)}
          >
            <Pencil />
          </button>
        </div>
        <div ref={nickname} className="profile-nickname">
          {editingName ? (
            <FeedbackForm
              className="stack profile-name-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = new FormData(event.currentTarget).get('name');
                void perform(async () => {
                  onUserChange((await api('me', 'PATCH', { name })).user);
                  setMessage('profile.nicknameSaved');
                  setEditingName(false);
                });
              }}
            >
              <Field
                label={t('profile.nickname')}
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
                  {t(busy ? 'common.saving' : 'profile.saveNickname')}
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
                  {t('common.cancel')}
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
                aria-label={t('profile.editNickname')}
                title={t('profile.editNickname')}
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
        </div>
        {user.email && (
          <p className="muted profile-email" title={user.email}>
            {user.email}
          </p>
        )}
        {user.linkedEmails?.map((email) => (
          <p className="muted profile-email" title={email} key={email}>
            {email} <small>({t('profile.yandex')})</small>
          </p>
        ))}
      </div>
      {editingAvatar && (
        <div className="avatar-edit-controls">
          <div className="profile-avatar-actions">
            <input
              ref={file}
              type="file"
              tabIndex={-1}
              accept="image/jpeg,image/png,image/webp"
              aria-label={t('profile.profilePictureFile')}
              className="avatar-file-input"
              disabled={busy}
              onChange={(event) => {
                const image = event.target.files?.[0];
                event.target.value = '';
                if (!image) return;
                void perform(async () => {
                  if (image.size > 5 * 1024 * 1024)
                    throw new ApiError('profile.avatarTooLarge');
                  const response = await fetch('/api/me/avatar', {
                    method: 'PUT',
                    headers: { 'Content-Type': image.type },
                    body: image,
                  });
                  const value = await response.json().catch(() => ({
                    error: t('profile.unableToUploadYourProfilePicture'),
                  }));
                  if (!response.ok)
                    throw new ApiError(
                      value.errorTranslation?.key ||
                        value.error ||
                        'profile.avatarUploadFailed',
                    );
                  onUserChange(value.user);
                  setMessage('profile.profilePictureUpdated');
                  setEditingAvatar(false);
                  avatarEdit.current?.focus();
                });
              }}
            />
            <FeedbackButton
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              {t(
                user.avatarVersion
                  ? 'profile.changePhoto'
                  : 'profile.uploadYourPhoto',
              )}
            </FeedbackButton>
            {user.avatarVersion && (
              <FeedbackButton
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    onUserChange((await api('me/avatar', 'DELETE')).user);
                    setMessage('profile.yourUploadedPictureHasBeenRemoved');
                  })
                }
              >
                {t('profile.removeYourPhoto')}
              </FeedbackButton>
            )}
          </div>
          <p className="field-hint">{t('profile.jpgPngOrWebpUpTo5')}</p>
        </div>
      )}
      <div ref={handleInput}>
        {editingHandle ? (
          <FeedbackForm
            className="stack profile-handle-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                const result = await api('me', 'PATCH', { username: handle });
                onUserChange(result.user);
                setHandle(result.user.username);
                setMessage('profile.usernameSaved');
                setEditingHandle(false);
              });
            }}
          >
            <p className="field-hint">
              {t('profile.aUniqueHandleForMentionsLatinLetters')}
            </p>
            <Field
              label={t('profile.username')}
              name="username"
              value={handle}
              onChange={(event) =>
                setHandle(event.target.value.replace(/^@/, ''))
              }
              minLength={3}
              maxLength={30}
              required
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
            />

            <FeedbackButton
              className="secondary"
              disabled={busy || handle === user.username}
            >
              {t('profile.saveUsername')}
            </FeedbackButton>
            <FeedbackButton
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setHandle(user.username || '');
                setEditingHandle(false);
                feedback.clear();
              }}
            >
              {t('common.cancel')}
            </FeedbackButton>
          </FeedbackForm>
        ) : (
          <div className="profile-handle-display">
            <span>{t('profile.username')} — </span>
            {user.username && (
              <a href={'/@' + user.username}>@{user.username}</a>
            )}
            <button
              ref={handleButton}
              type="button"
              className="icon-button"
              aria-label={t('profile.editUsername')}
              disabled={busy}
              onClick={() => {
                setHandle(user.username || '');
                setEditingHandle(true);
                setMessage('');
                feedback.clear();
              }}
            >
              <Pencil />
            </button>
          </div>
        )}
      </div>
      <p className="profile-status" role="status" aria-live="polite">
        {m(message)}
      </p>
      <h3>{t('common.yandexAccount')}</h3>
      {accounts.map((account) => (
        <div className="profile-yandex stack" key={account.id}>
          <ConnectedAccount account={account} />
          <p className="field-hint">
            {t('profile.disconnectingStopsSynchronizationDiskPhotosWillBe')}
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
                  setMessage('common.yandexAccountDisconnected');
                })
              }
            >
              {t('profile.disconnectYandex')}
            </FeedbackButton>
            <a className="text-button" href="/api/auth/yandex?intent=link">
              {t('profile.updatePermissions')}
            </a>
          </div>
        </div>
      ))}
      {!accounts.length &&
        !user.yandexAccountId &&
        (yandexEnabled ? (
          <a className="secondary centered" href="/api/auth/yandex?intent=link">
            {t('profile.connectAYandexAccount')}
          </a>
        ) : (
          <p className="muted">
            {t('profile.yandexDiskConnectionIsNotConfiguredYet')}
          </p>
        ))}
    </section>
  );
}

function Pencil() {
  return (
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
  );
}
