'use client';

import { useEffect, useState } from 'react';
import type { FollowedTrip } from '../lib/contracts';
import { api } from './api';
import { useLocale } from './appearance';
import { Icon, period } from './archive/shared';

export default function FollowedTrips({ userId }: { userId: string }) {
  const { t, m } = useLocale();
  const [trips, setTrips] = useState<FollowedTrip[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<{ trips: FollowedTrip[] }>(
      'follows',
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setTrips(result.trips);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [userId]);
  if (!trips.length && !error) return null;
  return (
    <section
      className="followed-trips"
      aria-labelledby="followed-trips-heading"
    >
      <div className="section-line">
        <h2 id="followed-trips-heading">{t('follow.collection')}</h2>
        <span>{trips.length}</span>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {m(error)}
        </p>
      )}
      <div className="trip-grid">
        {trips.map((trip) => (
          <article className="trip-card followed-card" key={trip.id}>
            <a href={trip.url}>
              <Icon name="star" size={22} />
              <h3>{trip.title}</h3>
              <p>{trip.destination}</p>
              <p>{period(trip)}</p>
              <p>
                {trip.media_count} {t('trip.moments')}
              </p>
            </a>
            <button
              className="text-button"
              disabled={busy === trip.id}
              onClick={async () => {
                setBusy(trip.id);
                setError('');
                try {
                  await api('follows/' + trip.id, 'DELETE');
                  setTrips((current) =>
                    current.filter((item) => item.id !== trip.id),
                  );
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : 'errors.requestFailed',
                  );
                } finally {
                  setBusy('');
                }
              }}
            >
              {t('follow.stop')}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
