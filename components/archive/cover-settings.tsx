'use client';

import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLocale } from '../appearance';
import MediaPreview from '../media-preview';
import { Icon } from './shared';
import CoverCropDialog from './cover-crop-dialog';
import { FeedbackButton } from '../feedback';
import type {
  TripCoverSettings,
  CoverPosition,
  MediaItem,
} from '../../lib/contracts';
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
  const [positions, setPositions] = useState<Record<string, CoverPosition>>({});
  const [editing, setEditing] = useState<MediaItem | null>(null);
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
        setIds(result.photoIds.slice(0, 5));
        setPositions(result.positions || {});
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
  const chosen = ids.filter((id) => available.has(id)).slice(0, 5);
  const value: TripCoverSettings = {
    mode: all ? 'all' : 'selected',
    photoIds: all ? [] : chosen,
    positions: all
      ? {}
      : Object.fromEntries(
          chosen.map((id) => [id, positions[id] || { x: 50, y: 50 }]),
        ),
  };
  const signature = (v: TripCoverSettings) =>
    v.mode === 'all'
      ? 'all'
      : JSON.stringify(
          v.photoIds.map((id) => ({
            id,
            ...(v.positions?.[id] || { x: 50, y: 50 }),
          })),
        );
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
          <fieldset className="cover-modes">
            <legend>{t('tripCover.mode')}</legend>
            {[true, false].map((mode) => (
              <label key={String(mode)}>
                <input
                  type="radio"
                  name={'cover-mode-' + trip.id}
                  checked={all === mode}
                  disabled={archive.busy || (!mode && !photos.length)}
                  onChange={() => setAll(mode)}
                />
                <span className="cover-mode-indicator" aria-hidden="true" />
                <span>{t(mode ? 'tripCover.all' : 'tripCover.custom')}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="cover-photo-options" disabled={archive.busy}>
            <legend>{t('tripCover.select')}</legend>
            <div className="cover-photo-grid">
              {photos.slice(0, limit).map((photo) => (
                <button
                  type="button"
                  className="cover-photo-option"
                  key={photo.id}
                  aria-label={t('tripCover.editPhoto', {
                    name: photo.title || photo.name,
                  })}
                  aria-pressed={!all && chosen.includes(photo.id)}
                  disabled={
                    !all && !chosen.includes(photo.id) && chosen.length >= 5
                  }
                  onClick={() => setEditing(photo)}
                >
                  <span className="cover-option-image">
                    <MediaPreview
                      src={archive.mediaPath(photo, 'preview')}
                      scope={archive.resourceScope}
                      kind="photo"
                      rotation={photo.rotation}
                    />
                    {!all && chosen.includes(photo.id) && (
                      <span className="cover-selected-mark" aria-hidden="true">
                        <Icon name="check" size={16} />
                      </span>
                    )}
                  </span>
                  <span>{photo.title || photo.name}</span>
                </button>
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
          {!all && (
            <p className="fine" role="status">
              {t('tripCover.count', { count: chosen.length })}
            </p>
          )}
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
      {editing && (
        <CoverCropDialog
          key={editing.id}
          archive={archive}
          photo={editing}
          initial={positions[editing.id] || { x: 50, y: 50 }}
          selected={!all && chosen.includes(editing.id)}
          onClose={() => setEditing(null)}
          onApply={(position) => {
            setPositions((old) => ({ ...old, [editing.id]: position }));
            setIds((old) =>
              all
                ? [editing.id]
                : old.includes(editing.id)
                  ? old
                  : [...chosen, editing.id].slice(0, 5),
            );
            setAll(false);
            setEditing(null);
          }}
          onRemove={() => {
            setIds((old) => old.filter((id) => id !== editing.id));
            if (chosen.length <= 1) setAll(true);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
