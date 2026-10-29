'use client';

import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLocale } from '../appearance';
import MediaPreview from '../media-preview';
import { FeedbackButton } from '../feedback';
import type { TripCoverSettings } from '../../lib/contracts';
import type { ArchiveController } from './use-archive';

export default function CoverSettings({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t, m } = useLocale();
  const trip = archive.trip!;
  const [saved, setSaved] = useState<TripCoverSettings | null>(null);
  const [all, setAll] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [limit, setLimit] = useState(24);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSaved(null);
    setError('');
    void api<TripCoverSettings>(
      'trips/' + trip.id + '/cover',
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setSaved(result);
        setAll(result.mode === 'all');
        setIds(result.photoIds);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [trip.id, attempt]);
  const photos = (archive.data?.media || []).filter(
    (photo) =>
      photo.kind === 'photo' &&
      photo.favorite &&
      !photo.hidden &&
      !photo.missing,
  );
  const available = new Set(photos.map((photo) => photo.id));
  const chosen = ids.filter((id) => available.has(id));
  const value: TripCoverSettings = {
    mode: all ? 'all' : 'selected',
    photoIds: all ? [] : chosen,
  };
  const signature = (v: TripCoverSettings) =>
    v.mode === 'all' ? 'all' : v.photoIds.slice().sort().join(',');
  return (
    <section
      className="panel cover-settings"
      aria-labelledby="trip-cover-title"
    >
      <h2 id="trip-cover-title">{t('tripCover.settings')}</h2>
      <h3>{t('tripCover.title')}</h3>
      <p className="muted">{t('tripCover.hint')}</p>
      {!saved && !error && <p role="status">{t('tripCover.loading')}</p>}
      {error && (
        <div role="alert">
          <p className="inline-error">{m(error)}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {saved && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void archive.action(async () => {
              const result = await api<TripCoverSettings>(
                'trips/' + trip.id + '/cover',
                'PATCH',
                value,
              );
              setSaved(result);
              setIds(result.photoIds);
              await archive.loadTrips();
              archive.setNotice('tripCover.saved');
            });
          }}
        >
          <label className="cover-all-option">
            <input
              type="checkbox"
              checked={all}
              disabled={archive.busy}
              onChange={(event) => setAll(event.target.checked)}
            />
            <span>{t('tripCover.all')}</span>
          </label>
          <fieldset
            className="cover-photo-options"
            disabled={all || archive.busy}
          >
            <legend>{t('tripCover.select')}</legend>
            <div className="cover-photo-grid">
              {photos.slice(0, limit).map((photo) => (
                <label className="cover-photo-option" key={photo.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(photo.id)}
                    aria-label={photo.title || photo.name}
                    onChange={(event) =>
                      setIds((old) =>
                        event.target.checked
                          ? [...old, photo.id]
                          : old.filter((id) => id !== photo.id),
                      )
                    }
                  />
                  <span className="cover-option-image">
                    <MediaPreview
                      src={archive.mediaPath(photo, 'preview')}
                      scope={archive.resourceScope}
                      kind="photo"
                      rotation={photo.rotation}
                    />
                  </span>
                  <span>{photo.title || photo.name}</span>
                </label>
              ))}
            </div>
            {photos.length > limit && (
              <button
                type="button"
                className="secondary"
                onClick={() => setLimit((n) => n + 24)}
              >
                {t('tripCover.more')}
              </button>
            )}
          </fieldset>
          {!photos.length && <p className="fine">{t('tripCover.empty')}</p>}
          <p className="fine">{t('tripCover.privacy')}</p>
          <FeedbackButton
            type="submit"
            className="primary"
            disabled={
              archive.busy ||
              (!all && !chosen.length) ||
              signature(value) === signature(saved)
            }
          >
            {t('tripCover.save')}
          </FeedbackButton>
        </form>
      )}
    </section>
  );
}
