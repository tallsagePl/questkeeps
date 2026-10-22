'use client';
import { useState } from 'react';
import { useLocale } from './appearance';
import { SocialShell, useViewer } from './social-shell';
import { PersonAvatar, FriendshipAction, type Person } from './friends';
export default function PublicProfile({ profile }: { profile: Person }) {
  const { t } = useLocale(),
    viewer = useViewer(),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState('');
  return (
    <SocialShell user={viewer.user}>
      <main
        id="main-content"
        tabIndex={-1}
        className="social-page public-person-page"
      >
        <a className="text-button" href="/">
          {t('К путешествиям')}
        </a>
        <section className="public-person-identity">
          <PersonAvatar person={profile} />
          <div>
            <h1>{profile.name}</h1>
            <p className="muted">@{profile.username}</p>
          </div>
        </section>
        <div className="public-person-actions">
          {viewer.user ? (
            <FriendshipAction person={profile} viewerId={viewer.user.id} />
          ) : viewer.ready ? (
            <a className="primary" href="/">
              {t('Войти, чтобы добавить в друзья')}
            </a>
          ) : (
            <p role="status" className="fine">
              {t('Загружаем…')}
            </p>
          )}
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  location.origin + '/@' + profile.username,
                );
                setCopied(true);
                setCopyError('');
              } catch {
                setCopyError(
                  'Не удалось скопировать ссылку. Скопируй адрес из строки браузера.',
                );
              }
            }}
          >
            {t(copied ? 'Ссылка скопирована' : 'Скопировать ссылку')}
          </button>
        </div>
        {copyError && <p role="alert">{t(copyError)}</p>}
        {viewer.error && <p role="alert">{t(viewer.error)}</p>}
        <div className="public-profile-privacy">
          <h2>{t('Истории для своего круга')}</h2>
          <p>
            {t(
              'Поездки открываются по приглашению или гостевой ссылке. В публичном профиле нет личных фотографий и контактных данных.',
            )}
          </p>
        </div>
      </main>
    </SocialShell>
  );
}
