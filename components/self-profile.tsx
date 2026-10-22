'use client';
import { useEffect, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';
import { FeedbackProvider, PageFeedback } from './feedback';
import ProfileSettings from './profile-settings';
import Friends from './friends';
import { SocialShell, useViewer } from './social-shell';

type Media = {
  id: string;
  name: string;
  title: string;
  taken: string;
  hidden: boolean;
};
export default function SelfProfile() {
  return (
    <FeedbackProvider>
      <ProfileContents />
    </FeedbackProvider>
  );
}
function ProfileContents() {
  const viewer = useViewer(),
    { t, language } = useLocale(),
    [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]),
    [media, setMedia] = useState<Media[]>([]),
    [enabled, setEnabled] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setAccounts([]);
    setMedia([]);
    setLoaded(false);
    if (!viewer.user) return;
    const c = new AbortController();
    void Promise.all([
      api('accounts', 'GET', undefined, c.signal),
      api('my-media', 'GET', undefined, c.signal),
      api('me', 'GET', undefined, c.signal),
    ])
      .then(([a, m, self]) => {
        if (c.signal.aborted) return;
        setAccounts(a.accounts);
        setMedia(m.media);
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
  async function toggle(m: Media) {
    setBusy(m.id);
    setError('');
    try {
      await api('media/' + m.id, 'PATCH', { hidden: !m.hidden });
      setMedia((old) =>
        old.map((item) =>
          item.id === m.id ? { ...item, hidden: !item.hidden } : item,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <SocialShell user={viewer.user} current="profile">
      <main
        id="main-content"
        className="social-page profile-page"
        tabIndex={-1}
      >
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
              {t('Мой публичный профиль')}
            </a>
          )}
        </div>
        <nav className="profile-section-nav" aria-label={t('Разделы профиля')}>
          <a href="#friends">{t('Друзья')}</a>
          <a href="#profile-settings">{t('Настройки')}</a>
          <a href="#my-files">{t('Файлы')}</a>
        </nav>
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
              <a className="text-button" href="#my-files">
                {t('Мои опубликованные файлы')}
              </a>
            </aside>
            <div className="profile-main">
              <Friends key={viewer.user.id} viewerId={viewer.user.id} />
              <section className="my-files-section" id="my-files">
                <h2>{t('Мои опубликованные файлы')}</h2>
                <p className="muted">
                  {t(
                    'Вы можете скрыть свои кадры даже после выхода из поездки.',
                  )}
                </p>
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
                {loaded && !error && !media.length && (
                  <p className="fine">{t('Пока нет фотографий.')}</p>
                )}
                <ul className="profile-files">
                  {media.map((m) => (
                    <li key={m.id}>
                      <div>
                        <strong>{m.name}</strong>
                        <small>
                          {m.title} ·{' '}
                          {new Date(
                            m.taken.slice(0, 10) + 'T12:00:00',
                          ).toLocaleDateString(
                            language === 'en' ? 'en-GB' : 'ru-RU',
                          )}{' '}
                          {m.hidden && (
                            <span className="fine">· {t('Скрыто')}</span>
                          )}
                        </small>
                      </div>
                      <button
                        className="text-button"
                        disabled={busy !== null}
                        onClick={() => void toggle(m)}
                      >
                        {t(
                          busy === m.id
                            ? 'Сохраняем…'
                            : m.hidden
                              ? 'Показать'
                              : 'Скрыть',
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </main>
    </SocialShell>
  );
}
