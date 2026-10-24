'use client';

import { useEffect, useState, useCallback } from 'react';
import type { DirectTripInvitation } from '../lib/contracts';
import { api } from './api';
import { useLocale } from './appearance';
import HeaderDropdown from './header-dropdown';
import { FeedbackProvider } from './feedback';

export default function TripInvitations({ userId }: { userId: string }) {
  const { t, m, language } = useLocale();
  const [items, setItems] = useState<DirectTripInvitation[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api('invitations', 'GET', undefined, signal);
      if (signal?.aborted) return;
      setItems(result.invitations);
      setCount(result.count);
    },
    [userId],
  );
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void load(controller.signal).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
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
        label={t('invitations.notifications')}
        triggerLabel={
          t('invitations.notifications') + (count ? ': ' + count : '')
        }
        onOpen={() => {
          setError('');
          setLoading(true);
          void load(AbortSignal.timeout(10000))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        }}
        trigger={
          <>
            <svg
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
            {count > 0 && (
              <span className="invitation-count">
                {count > 99 ? '99+' : count}
              </span>
            )}
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
            !items.length && <p>{t('invitations.empty')}</p>
          )}
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
