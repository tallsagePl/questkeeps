'use client';

import { useEffect, useState } from 'react';
import type { FollowedTrip } from '../lib/contracts';
import { api } from './api';
import TripCover from './trip-cover';
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
        {trips.map((trip, index) => (
          <article className="trip-card followed-card" key={trip.id}>
            <a href={trip.url}>
              <TripCover
                scope={'user:' + userId}
                covers={trip.covers}
                destination={trip.destination}
                index={index}
              />
              <div className="trip-card-body">
                <span className="eyebrow">{period(trip)}</span>
                <h3>{trip.title}</h3>
                <div className="trip-meta">
                  <span>
                    <Icon name="pin" size={16} />
                    {trip.destination}
                  </span>
                  <span>
                    {trip.media_count} {t('trip.moments')}{' '}
                    <Icon name="arrow" size={18} />
                  </span>
                </div>
              </div>
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
