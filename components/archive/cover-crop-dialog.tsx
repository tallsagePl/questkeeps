'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../modal';
import CoverPhotoFrame from '../cover-photo-frame';
import { useLocale } from '../appearance';
import { previewBlob } from '../../lib/preview-cache';
import { queuePreview } from '../../lib/preview-queue';
import type { CoverPosition, MediaItem } from '../../lib/contracts';
import type { ArchiveController } from './use-archive';

export default function CoverCropDialog({
  archive,
  photo,
  initial,
  selected,
  onApply,
  onRemove,
  onClose,
}: {
  archive: ArchiveController;
  photo: MediaItem;
  initial: CoverPosition;
  selected: boolean;
  onApply: (position: CoverPosition) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t, m } = useLocale();
  const [position, setPosition] = useState(initial);
  const [url, setUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [overflow, setOverflow] = useState({ x: false, y: false });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ratio, setRatio] = useState(2);
  const probe = useRef<HTMLDivElement>(null);
  const src = archive.mediaPath(photo, 'preview');
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    setError('');
    setReady(false);
    const work = queuePreview(archive.resourceScope + ':' + src, 0, (signal) =>
      previewBlob(src, archive.resourceScope, signal),
    );
    void work.promise
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      work.release();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, archive.resourceScope, attempt]);
  useEffect(() => {
    if (!probe.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height)
        setRatio(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(probe.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      {createPortal(
        <main
          className={
            'dashboard cover-size-probe' +
            (archive.trips.length <= 3 ? ' dashboard-compact' : '')
          }
          aria-hidden="true"
          inert
        >
          <div className="trip-grid">
            <div className="trip-card">
              <div ref={probe} className="trip-art" />
            </div>
          </div>
        </main>,
        document.body,
      )}
      <Modal title={t('tripCover.cropTitle')} wide onClose={onClose}>
        <p>{t('tripCover.cropHint')}</p>
        <div className="cover-crop-preview" style={{ aspectRatio: ratio }}>
          {url && (
            <CoverPhotoFrame
              src={url}
              rotation={photo.rotation}
              position={position}
              onChange={setPosition}
              onOverflow={setOverflow}
              onReady={() => setReady(true)}
            />
          )}
        </div>
        {!ready && !error && (
          <p role="status">{t('messages.loadingPreview')}</p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {m(error)}{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {t('common.retry')}
            </button>
          </p>
        )}
        <p className="fine">{t('tripCover.screenPreview')}</p>
        <div className="cover-crop-controls">
          <label>
            <span>{t('tripCover.horizontal')}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={position.x}
              disabled={!ready || !overflow.x}
              onChange={(event) =>
                setPosition((old) => ({
                  ...old,
                  x: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            <span>{t('tripCover.vertical')}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={position.y}
              disabled={!ready || !overflow.y}
              onChange={(event) =>
                setPosition((old) => ({
                  ...old,
                  y: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>
        <div className="cover-crop-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setPosition({ x: 50, y: 50 })}
          >
            {t('tripCover.center')}
          </button>
          {selected && (
            <button
              type="button"
              className="text-button danger"
              onClick={onRemove}
            >
              {t('tripCover.remove')}
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={!ready}
            onClick={() => onApply(position)}
          >
            {t('tripCover.apply')}
          </button>
        </div>
      </Modal>
    </>
  );
}
