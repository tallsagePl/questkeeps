'use client';
import BackButton from './back-button';
import { useState, useEffect } from 'react';
import { api } from './api';
import { useLocale } from './appearance';
import { SocialShell, useViewer } from './social-shell';
import { PersonAvatar, FriendshipAction, type Person } from './friends';
export default function PublicProfile({ profile }: { profile: Person }) {
  const { t } = useLocale(),
    viewer = useViewer(),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(''),
    [trips, setTrips] = useState<
      { id: string; title: string; start: string; end: string }[]
    >([]),
    [tripsError, setTripsError] = useState(''),
    [tripsReady, setTripsReady] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setTrips([]);
    setTripsError('');
    setTripsReady(false);
    if (!viewer.user || viewer.user.id === profile.id) return;
    const c = new AbortController();
    api(
      'profiles/' + encodeURIComponent(profile.username) + '/shared-trips',
      'GET',
      undefined,
      c.signal,
    )
      .then((r) => {
        if (!c.signal.aborted) {
          setTrips(r.trips);
          setTripsReady(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setTripsError(e.message);
          setTripsReady(true);
        }
      });
    return () => c.abort();
  }, [viewer.user?.id, profile.id, profile.username, revision]);
  return (
    <SocialShell user={viewer.user}>
      <main
        id="main-content"
        tabIndex={-1}
        className="social-page public-person-page"
      >
        <BackButton />
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
        {viewer.user && viewer.user.id !== profile.id && (
          <section className="shared-profile-trips">
            <h2>{t('Совместные путешествия')}</h2>
            {!tripsReady && <p role="status">{t('Загружаем…')}</p>}
            {tripsError && (
              <p role="alert">
                {t(tripsError)}{' '}
                <button
                  className="text-button"
                  onClick={() => setRevision((n) => n + 1)}
                >
                  {t('Повторить')}
                </button>
              </p>
            )}
            {tripsReady && !tripsError && !trips.length && (
              <p className="muted">
                {t('У вас пока нет совместных путешествий.')}
              </p>
            )}
            <ul>
              {trips.map((trip) => (
                <li key={trip.id}>
                  <a href={'/?trip=' + encodeURIComponent(trip.id)}>
                    {trip.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
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
