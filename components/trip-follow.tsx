'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useLocale } from './appearance';
import { Icon } from './archive/shared';

export default function TripFollow({
  token,
  tripId,
  userId,
}: {
  token: string;
  tripId: string;
  userId?: string;
}) {
  const { t, m } = useLocale();
  const [status, setStatus] = useState<{
    following: boolean;
    canFollow: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setStatus(null);
    setError('');
    if (!userId) return;
    const controller = new AbortController();
    void api<{ following: boolean; canFollow: boolean }>(
      'follows/status',
      'POST',
      { token },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setStatus(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [token, userId]);
  if (status?.canFollow === false) return null;
  return (
    <div className="trip-follow-control">
      <button
        className="secondary trip-follow"
        aria-pressed={status?.following || false}
        title={status?.following ? t('follow.stop') : t('follow.hint')}
        disabled={busy || (!!userId && !status && !error)}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            if (!userId) {
              await api('follows/pending', 'POST', { token });
              window.location.assign('/?follow=1');
              return;
            }
            const result = status?.following
              ? await api('follows/' + tripId, 'DELETE')
              : await api('follows', 'POST', { token });
            setStatus({ following: result.following, canFollow: true });
          } catch (error) {
            setError(
              error instanceof Error ? error.message : 'errors.requestFailed',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="star" size={18} />
        {busy
          ? t('common.pleaseWait')
          : status?.following
            ? t('follow.following')
            : t('follow.start')}
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {m(error)}
        </p>
      )}
    </div>
  );
}

export function FollowArrival({ userId }: { userId?: string }) {
  const { t, m } = useLocale();
  const [prompt, setPrompt] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ userId: string; promise: Promise<any> } | null>(
    null,
  );
  useEffect(() => {
    setPrompt(new URLSearchParams(location.search).get('follow') === '1');
  }, []);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    if (request.current?.userId !== userId)
      request.current = { userId, promise: api('follows/accept', 'POST', {}) };
    void request.current.promise
      .then((result) => {
        if (!active) return;
        setPrompt(false);
        if (result.accepted && result.url?.startsWith('/s/'))
          window.location.assign(result.url);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  if (!error && (!prompt || userId)) return null;
  return (
    <aside className="friend-arrival">
      <p role={error ? 'alert' : 'status'}>
        {error ? m(error) : t('follow.signInHint')}
      </p>
    </aside>
  );
}
