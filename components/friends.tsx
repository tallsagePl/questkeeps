'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';

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
      {person.name.slice(0, 1).toUpperCase()}
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
  const { t } = useLocale(),
    [status, setStatus] = useState<Status | undefined>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setStatus(initial);
    if (initial) return;
    const c = new AbortController();
    void api('friends/' + person.id, 'GET', undefined, c.signal)
      .then((r) => setStatus(r.relationship))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [person.id, viewerId, initial]);
  async function change(method: string) {
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
        {t('Редактировать профиль')}
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
          {t('Добавить в друзья')}
        </button>
      )}
      {status === 'incoming' && (
        <>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void change('PATCH')}
          >
            {t('Принять заявку')}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            {t('Отклонить')}
          </button>
        </>
      )}
      {status === 'outgoing' && (
        <>
          <span className="fine">{t('Заявка отправлена')}</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            {t('Отменить заявку')}
          </button>
        </>
      )}
      {status === 'friends' && (
        <>
          <span className="fine">{t('Вы друзья')}</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            {t('Удалить из друзей')}
          </button>
        </>
      )}
      {!status && !error && (
        <span className="fine" role="status">
          {t('Загружаем…')}
        </span>
      )}
      {error && (
        <p role="alert" className="friend-error">
          {t(error)}{' '}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              void api('friends/' + person.id)
                .then((r) => setStatus(r.relationship))
                .catch((e) => setError(e.message));
            }}
          >
            {t('Повторить')}
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
  const { t } = useLocale(),
    [lists, setLists] = useState<Lists>(empty),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [query, setQuery] = useState(''),
    [people, setPeople] = useState<Person[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState('');
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await api('friends', 'GET', undefined, signal);
        if (signal?.aborted) return;
        setLists(r);
        setError('');
        setReady(true);
      } catch (e) {
        if (!signal?.aborted) {
          setError((e as Error).message);
          setReady(true);
        }
      }
    },
    [viewerId],
  );
  useEffect(() => {
    setLists(empty);
    setReady(false);
    const c = new AbortController();
    void load(c.signal);
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === viewerId) void load(c.signal);
    };
    window.addEventListener('questkeeps:friends-changed', changed);
    return () => {
      c.abort();
      window.removeEventListener('questkeeps:friends-changed', changed);
    };
  }, [viewerId, load]);
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
          <FriendshipAction
            person={person}
            viewerId={viewerId}
            initial={status}
          />
        )}
      </li>
    );
  }
  return (
    <section
      className={'friends-section' + (compact ? ' friends-compact' : '')}
      id={compact ? undefined : 'friends'}
      aria-label={t('Друзья')}
    >
      <div className="friends-heading">
        <h2>
          {t('Друзья')}
          {ready && (
            <span className="friend-count">{lists.friends.length}</span>
          )}
        </h2>
        <a
          className="text-button"
          href={compact ? '/profile#friends' : '#find-people'}
        >
          {t(compact ? 'Все друзья' : 'Найти человека')}
        </a>
      </div>
      {!ready && (
        <p className="fine" role="status">
          {t('Загружаем друзей…')}
        </p>
      )}
      {error && (
        <p role="alert">
          {t(error)}{' '}
          <button className="text-button" onClick={() => void load()}>
            {t('Повторить')}
          </button>
        </p>
      )}
      {ready && !error && (
        <>
          {lists.friends.length ? (
            <ul className="friends-list">
              {(compact ? lists.friends.slice(0, 6) : lists.friends).map((p) =>
                row(p, 'friends'),
              )}
            </ul>
          ) : (
            <div className="friends-empty">
              <p>
                {t('Истории становятся ближе, когда есть с кем их разделить.')}
              </p>
              <a href={compact ? '/profile#find-people' : '#find-people'}>
                {t('Найти друзей')}
              </a>
            </div>
          )}
          {compact && !!lists.incoming.length && (
            <a className="friend-pending" href="/profile#friends">
              {t('Входящие заявки')}: {lists.incoming.length}
            </a>
          )}
          {!compact && (
            <>
              <p className="fine friend-privacy">
                {t(
                  'Список друзей и заявки видны только тебе. Дружба не открывает доступ к поездкам.',
                )}
              </p>
              {!!lists.incoming.length && (
                <div className="friend-requests">
                  <h3>
                    {t('Входящие заявки')}{' '}
                    <span className="friend-count">
                      {lists.incoming.length}
                    </span>
                  </h3>
                  <ul className="friends-list">
                    {lists.incoming.map((p) => row(p, 'incoming'))}
                  </ul>
                </div>
              )}
              {!!lists.outgoing.length && (
                <div className="friend-requests">
                  <h3>{t('Отправленные заявки')}</h3>
                  <ul className="friends-list">
                    {lists.outgoing.map((p) => row(p, 'outgoing'))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
      {!compact && (
        <div className="find-people" id="find-people">
          <h3>{t('Найти друзей')}</h3>
          <label className="field">
            <span>{t('Имя или @юзернейм')}</span>
            <input
              type="search"
              autoComplete="off"
              value={query}
              maxLength={80}
              placeholder={t('Кого позовём в следующую историю?')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {searching && (
            <p role="status" className="fine">
              {t('Ищем людей…')}
            </p>
          )}
          {searchError && <p role="alert">{t(searchError)}</p>}
          {!searching &&
            !searchError &&
            query.trim().length >= 2 &&
            !people.length && (
              <p className="fine">
                {t('Никого не нашли. Попробуй другой юзернейм.')}
              </p>
            )}
          {people.length > 0 && (
            <ul className="friends-list">{people.map((p) => row(p))}</ul>
          )}
        </div>
      )}
    </section>
  );
}
