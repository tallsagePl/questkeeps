'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { DirectTripInvitation } from '../lib/contracts';
import { api } from './api';
import { useLocale } from './appearance';
import HeaderDropdown from './header-dropdown';
import { FriendshipAction, type Person } from './friends';
import { FeedbackProvider } from './feedback';

export default function TripInvitations({ userId }: { userId: string }) {
  const { t, m, language } = useLocale();
  type Drive = {
    id: string;
    title: string;
    count: number;
    newest: number;
    stamp?: string;
  };
  const pending = useRef<AbortController | null>(null);
  const known = useRef(new Set<string>());
  const checkRequested = useRef(false);
  const mounted = useRef(true);
  const [incoming, setIncoming] = useState<Person[]>([]);
  const [accepted, setAccepted] = useState<Person[]>([]);
  const [driveChanges, setDriveChanges] = useState<Drive[]>([]);
  const [unread, setUnread] = useState(false);
  const [ring, setRing] = useState(0);
  const [items, setItems] = useState<DirectTripInvitation[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal, force = false) => {
      if (pending.current && !force) return;
      pending.current?.abort();
      const request = new AbortController();
      pending.current = request;
      const requestSignal = AbortSignal.any([
        request.signal,
        ...(signal ? [signal] : []),
        AbortSignal.timeout(10000),
      ]);
      try {
        const result = await api(
          'invitations',
          'GET',
          undefined,
          requestSignal,
        );
        if (requestSignal.aborted || !mounted.current) return;
        const invitations = result.invitations || [];
        setItems(invitations);
        const friends =
          result.friends && Array.isArray(result.friends.friends)
            ? result.friends
            : undefined;
        const accepted = (result.accepted || []) as Person[];
        const changes = (result.driveChanges || []) as Drive[];
        setIncoming(friends?.incoming || []);
        setAccepted(accepted);
        setDriveChanges(changes);
        if (friends)
          window.dispatchEvent(
            new CustomEvent('questkeeps:social-updated', {
              detail: { userId, friends },
            }),
          );
        const keys = [
          ...invitations.map((i: DirectTripInvitation) => 'invite:' + i.id),
          ...(friends?.incoming || []).map((p: Person) => 'friend:' + p.id),
          ...accepted.map((p) => 'accepted:' + p.id),
          ...changes.map(
            (trip) => 'drive:' + trip.id + ':' + (trip.stamp || trip.newest),
          ),
        ];
        const unseen = keys.filter((key) => !(result.seen || []).includes(key));
        setUnread(unseen.length > 0);
        if (unseen.some((key) => !known.current.has(key)))
          setRing((n) => n + 1);
        known.current = new Set(keys);
        setCount(
          Number(result.count || 0) +
            (friends?.incoming.length || 0) +
            accepted.length +
            changes.length,
        );
        if (!checkRequested.current) {
          checkRequested.current = true;
          void api('invitations/check-drive', 'POST', {}, requestSignal).catch(
            () => {
              checkRequested.current = false;
            },
          );
        }
      } catch (error) {
        if (!request.signal.aborted && !signal?.aborted) throw error;
      } finally {
        if (pending.current === request) pending.current = null;
      }
    },
    [userId],
  );
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void load(controller.signal).catch(() => {});
    };
    const timer = window.setInterval(refresh, 15000);
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === userId)
        void load(controller.signal, true).catch(() => {});
    };
    window.addEventListener('questkeeps:friends-changed', changed);
    // Establish the baseline before asking the worker to check Drive.
    void load(controller.signal).catch(() => {});
    const ending = () => {
      pending.current?.abort();
    };
    window.addEventListener('questkeeps:session-ending', ending);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      mounted.current = false;
      controller.abort();
      pending.current?.abort();
      pending.current = null;
      window.removeEventListener('questkeeps:friends-changed', changed);
      window.clearInterval(timer);
      window.removeEventListener('questkeeps:session-ending', ending);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);
  const date = (value: string) =>
    new Date(value + 'T12:00:00').toLocaleDateString(
      language === 'ru' ? 'ru-RU' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' },
    );
  return (
    <FeedbackProvider>
      <HeaderDropdown
        className="text-button invitation-notifications"
        label={t('notifications.title')}
        triggerLabel={t('notifications.title') + (count ? ': ' + count : '')}
        onOpen={() => {
          setError('');
          setLoading(true);
          void load(AbortSignal.timeout(10000), true)
            .catch((e) => setError(e.message))
            .finally(() => {
              setLoading(false);
              void api('invitations/read', 'POST', {
                keys: [...known.current].slice(-300),
              }).catch(() => {});
              setUnread(false);
            });
        }}
        trigger={
          <>
            <svg
              key={ring}
              className={
                ring ? 'notification-bell is-ringing' : 'notification-bell'
              }
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" />
            </svg>
            {unread && <span className="notification-dot" aria-hidden="true" />}
          </>
        }
      >
        <div className="stack invitation-inbox">
          {error && (
            <p className="inline-error" role="alert">
              {m(error)}
            </p>
          )}
          {loading ? (
            <p role="status">{t('invitations.loading')}</p>
          ) : (
            !items.length &&
            !incoming.length &&
            !accepted.length &&
            !driveChanges.length && <p>{t('notifications.empty')}</p>
          )}
          {!loading &&
            incoming.map((person) => (
              <article className="invitation-item" key={'friend:' + person.id}>
                <h3>
                  {t('notifications.friendRequest', { name: person.name })}
                </h3>
                <a href={'/@' + person.username}>@{person.username}</a>
                <FriendshipAction
                  person={person}
                  viewerId={userId}
                  initial="incoming"
                  onChange={() => void load()}
                />
              </article>
            ))}
          {!loading &&
            accepted.map((person) => (
              <article
                className="invitation-item"
                key={'accepted:' + person.id}
              >
                <h3>
                  {t('notifications.friendAccepted', { name: person.name })}
                </h3>
                <a href={'/@' + person.username}>@{person.username}</a>
              </article>
            ))}
          {!loading &&
            driveChanges.map((trip) => (
              <article className="invitation-item" key={'drive:' + trip.id}>
                <h3>{t('notifications.newPhotos')}</h3>
                <p>{trip.title}</p>
                <div className="invitation-actions">
                  <a
                    className="secondary"
                    href={'/?trip=' + encodeURIComponent(trip.id)}
                  >
                    {t('notifications.openTrip')}
                  </a>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(trip.id);
                      try {
                        await api('invitations/drive-read', 'POST', {
                          tripId: trip.id,
                        });
                      } catch (e) {
                        setError((e as Error).message);
                        return;
                      } finally {
                        setBusy('');
                      }
                      setDriveChanges((old) =>
                        old.filter((item) => item.id !== trip.id),
                      );
                      window.dispatchEvent(
                        new CustomEvent('questkeeps:archive-refresh', {
                          detail: { userId, tripId: trip.id },
                        }),
                      );
                      if (
                        new URL(location.href).searchParams.get('trip') !==
                          trip.id ||
                        location.pathname !== '/'
                      )
                        location.assign(
                          '/?trip=' + encodeURIComponent(trip.id),
                        );
                      void load();
                    }}
                  >
                    {t('notifications.refreshTrip')}
                  </button>
                </div>
              </article>
            ))}
          {!loading &&
            items.map((invite) => (
              <article key={invite.id} className="invitation-item">
                <h3>{invite.title}</h3>
                <p>{t('invitations.from', { name: invite.sender })}</p>
                <p className="muted">
                  {invite.destination} · {date(invite.start)} —{' '}
                  {date(invite.end)}
                </p>
                <p className="fine">
                  {t(
                    invite.all_photos
                      ? 'invitations.viewAll'
                      : 'invitations.viewPeriod',
                  )}
                </p>
                <p className="fine">
                  {t('invitations.expires', {
                    date: new Date(invite.expires).toLocaleDateString(
                      language === 'ru' ? 'ru-RU' : 'en-GB',
                    ),
                  })}
                </p>
                <div className="invitation-actions">
                  {(['accept', 'decline'] as const).map((action) => (
                    <button
                      key={action}
                      className={action === 'accept' ? 'primary' : 'secondary'}
                      disabled={!!busy}
                      onClick={() => {
                        setBusy(invite.id);
                        setError('');
                        void api('invitations/' + invite.id, 'POST', {
                          action,
                        })
                          .then(async (result) => {
                            if (result.tripId)
                              window.location.assign(
                                '/?trip=' + encodeURIComponent(result.tripId),
                              );
                            else await load();
                          })
                          .catch((e) => {
                            setError(e.message);
                            void load().catch(() => {});
                          })
                          .finally(() => setBusy(''));
                      }}
                    >
                      {t(
                        action === 'accept'
                          ? 'invitations.accept'
                          : 'invitations.decline',
                      )}
                    </button>
                  ))}
                </div>
              </article>
            ))}
        </div>
      </HeaderDropdown>
    </FeedbackProvider>
  );
}
