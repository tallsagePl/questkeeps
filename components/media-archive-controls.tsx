'use client';

import { useState } from 'react';
import { useLocale } from './appearance';

export function MediaRotationControls({
  disabled,
  onRotate,
}: {
  disabled?: boolean;
  onRotate: (step: number) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="media-rotation-controls">
      {[-90, 90].map((step) => (
        <button
          key={step}
          type="button"
          className="icon-button"
          aria-disabled={!!disabled}
          aria-label={t(
            step < 0 ? 'mediaArchive.rotateLeft' : 'mediaArchive.rotateRight',
          )}
          onClick={() => {
            if (!disabled) onRotate(step);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={step > 0 ? { transform: 'scaleX(-1)' } : undefined}
          >
            <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function MediaArchiveDelete({
  disabled,
  onDelete,
}: {
  disabled?: boolean;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="media-archive-delete">
      {confirming && <p>{t('mediaArchive.explanation')}</p>}
      <div className="media-delete-actions">
        <button
          type="button"
          className="secondary danger"
          disabled={disabled}
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
          </svg>
          {t(confirming ? 'mediaArchive.confirm' : 'mediaArchive.remove')}
        </button>
        {confirming && (
          <button
            type="button"
            className="secondary"
            aria-disabled={!!disabled}
            onClick={() => setConfirming(false)}
          >
            {t('mediaArchive.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
