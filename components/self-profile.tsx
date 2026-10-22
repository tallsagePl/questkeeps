'use client';
import BackButton from './back-button';
import { useEffect, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';
import { FeedbackProvider, PageFeedback } from './feedback';
import ProfileSettings from './profile-settings';
import Friends from './friends';
import ProfileFiles from './profile-files';
import { SocialShell, useViewer } from './social-shell';

export default function SelfProfile() {
  return (
    <FeedbackProvider>
      <ProfileContents />
    </FeedbackProvider>
  );
}
function ProfileContents() {
  const viewer = useViewer(),
    { t } = useLocale(),
    [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]),
    [enabled, setEnabled] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setAccounts([]);
    setLoaded(false);
    if (!viewer.user) return;
    const c = new AbortController();
    void Promise.all([
      api('accounts', 'GET', undefined, c.signal),
      api('me', 'GET', undefined, c.signal),
    ])
      .then(([a, self]) => {
        if (c.signal.aborted) return;
        setAccounts(a.accounts);
        setEnabled(self.yandexEnabled);
        setLoaded(true);
        setError('');
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setLoaded(true);
        }
      });
    return () => c.abort();
  }, [viewer.user?.id, revision]);
  return (
    <SocialShell user={viewer.user} current="profile">
      <main
        id="main-content"
        className="social-page profile-page"
        tabIndex={-1}
      >
        <BackButton />
        <div className="social-page-intro">
          <div>
            <h1>
              {t('Мой профиль')}
              <span className="brand-dot">.</span>
            </h1>
            <p className="muted">
              {t('Люди, с которыми хочется разделить следующий маршрут.')}
            </p>
          </div>
          {viewer.user?.username && (
            <a className="secondary" href={'/@' + viewer.user.username}>
              {t('Как меня видят')}
            </a>
          )}
        </div>
        <PageFeedback />
        {!viewer.ready && <p role="status">{t('Загружаем профиль…')}</p>}
        {viewer.error && (
          <p role="alert">
            {t(viewer.error)}{' '}
            <button className="text-button" onClick={() => location.reload()}>
              {t('Повторить')}
            </button>
          </p>
        )}
        {viewer.ready && !viewer.user && !viewer.error && (
          <div className="profile-signin">
            <h2>{t('Здесь будет твоя история')}</h2>
            <p>{t('Войди, чтобы настроить профиль и найти друзей.')}</p>
            <a className="primary" href="/">
              {t('Войти')}
            </a>
          </div>
        )}
        {viewer.user && (
          <div className="profile-columns">
            <aside className="profile-settings-panel" id="profile-settings">
              <h2>{t('Обо мне')}</h2>
              {error && (
                <p role="alert">
                  {t(error)}{' '}
                  <button
                    className="text-button"
                    onClick={() => setRevision((n) => n + 1)}
                  >
                    {t('Повторить')}
                  </button>
                </p>
              )}
              {!loaded && <p role="status">{t('Загружаем настройки…')}</p>}
              {loaded && !error && (
                <ProfileSettings
                  key={viewer.user.id}
                  user={viewer.user}
                  accounts={accounts}
                  yandexEnabled={enabled}
                  onUserChange={viewer.setUser}
                  onAccountsChange={setAccounts}
                />
              )}
            </aside>
            <div className="profile-main">
              <Friends
                key={'friends:' + viewer.user.id}
                viewerId={viewer.user.id}
              />
              <ProfileFiles
                key={'files:' + viewer.user.id}
                userId={viewer.user.id}
              />
            </div>
          </div>
        )}
      </main>
    </SocialShell>
  );
}
