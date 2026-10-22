'use client';
import {
  announceSessionChange,
  observeSessionChanges,
} from '../lib/browser-session';
import { useEffect, useState, type ReactNode } from 'react';
import Brand from './brand';
import { AppearanceControls, useLocale } from './appearance';
import UserAvatar, { type ProfileUser } from './user-avatar';
import { api } from './api';
import { clearPreviewCache } from '../lib/preview-cache';
import { migratePrivateStorage } from '../lib/browser-storage';

export function useViewer() {
  const [user, setUser] = useState<ProfileUser | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void migratePrivateStorage().catch(() => {});
    api('me', 'GET', undefined, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return;
        setUser(r.user);
        setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setReady(true);
        }
      });
    const stop = observeSessionChanges();
    const ending = () => setUser(null);
    window.addEventListener('questkeeps:session-ending', ending);
    return () => {
      controller.abort();
      stop();
      window.removeEventListener('questkeeps:session-ending', ending);
    };
  }, []);
  return { user, setUser, ready, error };
}
export async function signOut() {
  await api('auth/logout', 'POST', {});
  window.dispatchEvent(new Event('questkeeps:session-ending'));
  announceSessionChange();
  try {
    await clearPreviewCache();
  } finally {
    window.location.replace('/');
  }
}
export function SocialShell({
  user,
  current,
  children,
}: {
  user: ProfileUser | null;
  current?: string;
  children: ReactNode;
}) {
  const { t } = useLocale(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="social-shell">
      <a className="skip-link" href="#main-content">
        {t('Перейти к содержимому')}
      </a>
      <header className="topbar social-topbar">
        <Brand />
        <nav className="social-nav" aria-label={t('Главная навигация')}>
          <a href="/">{t('Путешествия')}</a>
          <a
            href="/about"
            aria-current={current === 'about' ? 'page' : undefined}
          >
            {t('О проекте')}
          </a>
        </nav>
        <div className="top-actions">
          {user ? (
            <>
              <a
                className="text-button user-button"
                href="/profile"
                aria-label={t('Мой профиль')}
              >
                <UserAvatar user={user} />
                <span>{user.name}</span>
              </a>
              <AppearanceControls />
              <button
                className="text-button header-logout"
                aria-label={t('Выйти')}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signOut().catch((e) => {
                    setError(e.message);
                    setBusy(false);
                  });
                }}
              >
                <span>{t('Выйти')}</span>
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
                  <path d="M9 5H5v14h4M13 8l4 4-4 4M8 12h13" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <AppearanceControls />
              <a className="text-button" href="/">
                {t('Войти')}
              </a>
            </>
          )}
        </div>
      </header>
      {error && (
        <p className="social-page-error" role="alert">
          {t(error)}
        </p>
      )}
      {children}
      <footer>
        <Brand footer />
        <p>{t('Не просто где вы были. А что вы чувствовали.')}</p>
        <a href="/about">{t('О проекте')}</a>
      </footer>
    </div>
  );
}
