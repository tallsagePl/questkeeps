'use client';

import HeaderMenu from './header-menu';
import TripInvitations from './trip-invitations';
import SiteFooter from './site-footer';
import {
  announceSessionChange,
  observeSessionChanges,
} from '../lib/browser-session';
import { useEffect, useState, type ReactNode } from 'react';
import { HeaderBrand } from './brand';
import { AppearanceControls, useLocale } from './appearance';
import UserAvatar, { type ProfileUser } from './user-avatar';
import { api } from './api';
import { clearPreviewCache } from '../lib/preview-cache';
import { migratePrivateStorage } from '../lib/browser-storage';

export function useViewer() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
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
  const { t, m } = useLocale();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="social-shell">
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <header className="topbar social-topbar site-header">
        <HeaderMenu
          back
          logout={
            user ? (
              <button
                className="text-button header-logout"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signOut().catch((e) => {
                    setError(e.message);
                    setBusy(false);
                  });
                }}
              >
                {t('auth.signOut')}
              </button>
            ) : undefined
          }
        />
        <HeaderBrand />
        <nav className="social-nav" aria-label={t('navigation.mainNavigation')}>
          <a href="/">{t('navigation.trips')}</a>
          <a
            href="/about"
            aria-current={current === 'about' ? 'page' : undefined}
          >
            {t('navigation.about')}
          </a>
        </nav>
        <div className="top-actions">
          {user && <TripInvitations key={user.id} userId={user.id} />}
          {user ? (
            <>
              <a
                className="text-button user-button"
                href="/profile"
                aria-label={t('profile.title')}
                aria-current={current === 'profile' ? 'page' : undefined}
              >
                <UserAvatar user={user} />
                <span>{user.name}</span>
              </a>
              <AppearanceControls />
              <button
                className="text-button header-logout"
                aria-label={t('auth.signOut')}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signOut().catch((e) => {
                    setError(e.message);
                    setBusy(false);
                  });
                }}
              >
                <span>{t('auth.signOut')}</span>
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
                {t('auth.signIn')}
              </a>
            </>
          )}
        </div>
      </header>
      {error && (
        <p className="social-page-error" role="alert">
          {m(error)}
        </p>
      )}
      {children}
      <SiteFooter />
    </div>
  );
}
