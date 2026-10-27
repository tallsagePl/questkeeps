'use client';

import { useState, useEffect } from 'react';
import { api } from './api';
import { useLocale } from './appearance';
import { SocialShell, useViewer } from './social-shell';
import { PersonAvatar, FriendshipAction, type Person } from './friends';

export default function PublicProfile({ profile }: { profile: Person }) {
  const { t, m } = useLocale();
  const viewer = useViewer();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const [copyError, setCopyError] = useState('');
  const [trips, setTrips] = useState<
    { id: string; title: string; start: string; end: string }[]
  >([]);
  const [tripsError, setTripsError] = useState('');
  const [tripsReady, setTripsReady] = useState(false);
  const [revision, setRevision] = useState(0);
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
        <section className="public-person-identity">
          <PersonAvatar person={profile} />
          <div>
            <h1>{profile.name}</h1>
            <button
              className="text-button public-profile-handle"
              data-copied={copied}
              title={t('common.copyLink')}
              aria-label={t(copied ? 'common.linkCopied' : 'common.copyLink')}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    location.origin + '/@' + profile.username,
                  );
                  setCopied(true);
                  setCopyError('');
                } catch {
                  setCopyError('publicProfile.couldNotCopyTheLinkCopyThe');
                }
              }}
            >
              @{profile.username}
            </button>
          </div>
        </section>
        <div className="public-person-actions">
          {viewer.user ? (
            <FriendshipAction person={profile} viewerId={viewer.user.id} />
          ) : viewer.ready ? (
            <a className="primary" href="/">
              {t('publicProfile.signInToAddAFriend')}
            </a>
          ) : (
            <p role="status" className="fine">
              {t('common.loading')}
            </p>
          )}
        </div>
        {copyError && <p role="alert">{m(copyError)}</p>}
        {viewer.error && <p role="alert">{m(viewer.error)}</p>}
        {viewer.user && viewer.user.id !== profile.id && (
          <section className="shared-profile-trips">
            <h2>{t('publicProfile.sharedTrips')}</h2>
            {!tripsReady && <p role="status">{t('common.loading')}</p>}
            {tripsError && (
              <p role="alert">
                {m(tripsError)}{' '}
                <button
                  className="text-button"
                  onClick={() => setRevision((n) => n + 1)}
                >
                  {t('common.retry')}
                </button>
              </p>
            )}
            {tripsReady && !tripsError && !trips.length && (
              <p className="muted">
                {t('publicProfile.youHaveNoSharedTripsYet')}
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
          <h2>{t('publicProfile.storiesForYourCircle')}</h2>
          <p>{t('publicProfile.tripsAreSharedByInvitationOrGuest')}</p>
        </div>
      </main>
    </SocialShell>
  );
}
