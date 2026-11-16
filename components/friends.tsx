'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useLocale } from './appearance';
import { api } from './api';
import FriendLink from './friend-link';
import { AvatarPlaceholder } from './user-avatar';
import type { FriendTrip } from '../lib/friends';
import styles from './friends-page.module.css';

export type Person = {
  id: string;
  name: string;
  username: string;
  hasAvatar: boolean;
};

type Status = 'self' | 'none' | 'incoming' | 'outgoing' | 'friends';

type Lists = { friends: Person[]; incoming: Person[]; outgoing: Person[] };

const empty: Lists = { friends: [], incoming: [], outgoing: [] };

export function PersonAvatar({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar friend-avatar" aria-hidden="true">
      <AvatarPlaceholder />
      {person.hasAvatar && !failed && (
        <img
          src={'/api/profiles/' + person.username + '/avatar'}
          alt=""
          width="48"
          height="48"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function FriendshipAction({
  person,
  viewerId,
  initial,
  onChange,
}: {
  person: Person;
  viewerId: string;
  initial?: Status;
  onChange?: () => void;
}) {
  const { t, m } = useLocale();
  const [status, setStatus] = useState<Status | undefined>(initial);
  const statusGeneration = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const generation = ++statusGeneration.current;
    setStatus(initial);
    if (initial) return;
    const c = new AbortController();
    void api('friends/' + person.id, 'GET', undefined, c.signal)
      .then((r) => {
        if (generation === statusGeneration.current && !c.signal.aborted)
          setStatus(r.relationship);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [person.id, viewerId, initial]);
  useEffect(() => {
    const updated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.userId !== viewerId || !detail.friends) return;
      statusGeneration.current++;
      const lists = detail.friends as Lists;
      setStatus(
        lists.friends.some((p) => p.id === person.id)
          ? 'friends'
          : lists.incoming.some((p) => p.id === person.id)
            ? 'incoming'
            : lists.outgoing.some((p) => p.id === person.id)
              ? 'outgoing'
              : 'none',
      );
    };
    window.addEventListener('questkeeps:social-updated', updated);
    return () =>
      window.removeEventListener('questkeeps:social-updated', updated);
  }, [person.id, viewerId]);
  async function change(method: string) {
    statusGeneration.current++;
    setBusy(true);
    setError('');
    try {
      const r = await api(
        'friends/' + person.id,
        method,
        method === 'PATCH' ? { action: 'accept' } : undefined,
      );
      setStatus(r.relationship);
      window.dispatchEvent(
        new CustomEvent('questkeeps:friends-changed', { detail: viewerId }),
      );
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (person.id === viewerId)
    return (
      <a className="secondary" href="/profile">
        {t('friends.editProfile')}
      </a>
    );
  return (
    <div className="friend-actions" aria-busy={busy}>
      {status === 'none' && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void change('POST')}
        >
          {t('friends.addFriend')}
        </button>
      )}
      {status === 'incoming' && (
        <>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void change('PATCH')}
          >
            {t('friends.acceptRequest')}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            {t('friends.decline')}
          </button>
        </>
      )}
      {status === 'outgoing' && (
        <>
          <span className="fine">{t('friends.requestSent')}</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            {t('friends.cancelRequest')}
          </button>
        </>
      )}
      {status === 'friends' && (
        <>
          <button
            className="secondary friend-remove"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <circle cx="9" cy="7" r="4" />
              <path d="M2 21v-2a7 7 0 0 1 13-3M16 11l6 6m0-6-6 6" />
            </svg>
            {t('friends.removeFriend')}
          </button>
        </>
      )}
      {!status && !error && (
        <span className="fine" role="status">
          {t('common.loading')}
        </span>
      )}
      {error && (
        <p role="alert" className="friend-error">
          {m(error)}{' '}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              void api('friends/' + person.id)
                .then((r) => setStatus(r.relationship))
                .catch((e) => setError(e.message));
            }}
          >
            {t('common.retry')}
          </button>
        </p>
      )}
    </div>
  );
}

export default function Friends({
  viewerId,
  compact = false,
}: {
  viewerId: string;
  compact?: boolean;
}) {
  const { t, m } = useLocale();
  const [lists, setLists] = useState<Lists>(empty);
  const [latestTrips, setLatestTrips] = useState<Record<string, FriendTrip>>(
    {},
  );
  const acceptedFriends = useRef('');
  const listGeneration = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++listGeneration.current;
      try {
        const r = await api<
          Lists & { latestTrips?: Record<string, FriendTrip> }
        >(compact ? 'friends' : 'friends?trips=1', 'GET', undefined, signal);
        if (signal?.aborted || generation !== listGeneration.current) return;
        acceptedFriends.current = r.friends
          .map((person) => person.id)
          .join(',');
        setLists(r);
        setLatestTrips(r.latestTrips ?? {});
        setError('');
        setReady(true);
      } catch (e) {
        if (!signal?.aborted && generation === listGeneration.current) {
          setError((e as Error).message);
          setReady(true);
        }
      }
    },
    [viewerId, compact],
  );
  useEffect(() => {
    setLists(empty);
    setLatestTrips({});
    acceptedFriends.current = '';
    setReady(false);
    const c = new AbortController();
    void load(c.signal);
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === viewerId) void load(c.signal);
    };
    const updated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.userId === viewerId && detail.friends) {
        const snapshot = detail.friends as Lists;
        const key = snapshot.friends.map((person) => person.id).join(',');
        if (!compact && key !== acceptedFriends.current) void load(c.signal);
        acceptedFriends.current = key;
        setLists(snapshot);
        setReady(true);
        setError('');
      }
    };
    window.addEventListener('questkeeps:social-updated', updated);
    window.addEventListener('questkeeps:friends-changed', changed);
    const focus = () => void load(c.signal);
    if (!compact) window.addEventListener('focus', focus);
    return () => {
      c.abort();
      window.removeEventListener('questkeeps:friends-changed', changed);
      window.removeEventListener('focus', focus);
      window.removeEventListener('questkeeps:social-updated', updated);
    };
  }, [viewerId, load, compact]);
  useEffect(() => {
    setPeople([]);
    setSearchError('');
    if (query.trim().length < 2) {
      setSearching(false);
      return;
    }
    const c = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void api(
        'profiles?q=' + encodeURIComponent(query.trim()),
        'GET',
        undefined,
        c.signal,
      )
        .then((r) => {
          if (!c.signal.aborted)
            setPeople(r.users.filter((p: Person) => p.id !== viewerId));
        })
        .catch((e) => {
          if (!c.signal.aborted) setSearchError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query, viewerId]);
  function row(person: Person, status?: Status) {
    const trip = status === 'friends' ? latestTrips[person.id] : undefined;
    return (
      <li className="friend-row" key={person.id}>
        <a className="friend-person" href={'/@' + person.username}>
          <PersonAvatar person={person} />
          <span>
            <strong>{person.name}</strong>
            <small>@{person.username}</small>
          </span>
        </a>
        {!compact && (
          <>
            {trip ? (
              <a className={styles.trip} href={trip.url}>
                <strong>{trip.title}</strong>
                <span>{trip.destination}</span>
              </a>
            ) : status === 'friends' ? (
              <p className={styles.noTrip}>{t('friends.noAccessibleTrips')}</p>
            ) : null}
            <FriendshipAction
              person={person}
              viewerId={viewerId}
              initial={status}
            />
          </>
        )}
      </li>
    );
  }
  const title = (
    <>
      {t('friends.friends')}
      {ready && (
        <span className="friend-count" aria-hidden="true">
          {lists.friends.length}
        </span>
      )}
    </>
  );
  return (
    <section
      className={
        'friends-section ' +
        (compact
          ? 'friends-compact' +
            (lists.friends.length ? ' friends-compact-populated' : '')
          : styles.section)
      }
      id={compact ? undefined : 'friends'}
      aria-label={t('friends.friends')}
    >
      <div className="friends-heading">
        {compact ? <h2>{title}</h2> : <h1 className={styles.title}>{title}</h1>}
        {compact && (
          <a className="text-button" href="/people/friends">
            {t('common.allFriends')}
          </a>
        )}
      </div>
      {!ready && (
        <p className="fine" role="status">
          {t('friends.loadingFriends')}
        </p>
      )}
      {error && (
        <p role="alert">
          {m(error)}{' '}
          <button className="text-button" onClick={() => void load()}>
            {t('common.retry')}
          </button>
        </p>
      )}
      {ready && !error && (
        <>
          {lists.friends.length ? (
            <ul
              className={
                compact ? 'friends-list' : 'friends-list ' + styles.accepted
              }
            >
              {(compact ? lists.friends.slice(0, 6) : lists.friends).map((p) =>
                row(p, 'friends'),
              )}
            </ul>
          ) : (
            <div className="friends-empty">
              <p>{t('friends.storiesFeelCloserWhenYouHaveSomeone')}</p>
              <a
                href={compact ? '/people/friends#find-people' : '#find-people'}
              >
                {t('friends.findFriends')}
              </a>
            </div>
          )}
          {compact && !!lists.incoming.length && (
            <a className="friend-pending" href="/people/friends#friends">
              {t('friends.friendRequests')}: {lists.incoming.length}
            </a>
          )}
          {!compact && (
            <p className="fine friend-privacy">
              {t('friends.onlyYouCanSeeYourFriendsAnd')}
            </p>
          )}
          {!compact && !!lists.incoming.length && (
            <div className="friend-requests">
              <h2>
                {t('friends.friendRequests')}{' '}
                <span className="friend-count">{lists.incoming.length}</span>
              </h2>
              <ul className="friends-list">
                {lists.incoming.map((p) => row(p, 'incoming'))}
              </ul>
            </div>
          )}
          {!compact && !!lists.outgoing.length && (
            <div className="friend-requests">
              <h2>{t('friends.sentRequests')}</h2>
              <ul className="friends-list">
                {lists.outgoing.map((p) => row(p, 'outgoing'))}
              </ul>
            </div>
          )}
        </>
      )}
      {!compact && (
        <div className="friend-discovery">
          <div className="find-people" id="find-people">
            <h2>{t('friends.findFriends')}</h2>
            <label className="field">
              <span>{t('common.nameOrUsername')}</span>
              <input
                type="search"
                autoComplete="off"
                value={query}
                maxLength={80}
                placeholder={t('friends.whoWillJoinTheNextStory')}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {searching && (
              <p role="status" className="fine">
                {t('friends.findingPeople')}
              </p>
            )}
            {searchError && <p role="alert">{m(searchError)}</p>}
            {!searching &&
              !searchError &&
              query.trim().length >= 2 &&
              !people.length && (
                <p className="fine">
                  {t('friends.noMatchesTryAnotherUsername')}
                </p>
              )}
            {people.length > 0 && (
              <ul className="friends-list">{people.map((p) => row(p))}</ul>
            )}
          </div>
          <FriendLink />
        </div>
      )}
    </section>
  );
}
