'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';

export default function PlaceDelete({
  mediaId,
  placeId,
  title,
  onDelete,
  deletePath,
}: {
  deletePath?: string;
  mediaId: string;
  placeId: string;
  title: string;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trash = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const heading = useId();
  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);
  const dismiss = () => {
    setConfirming(false);
    setError('');
    requestAnimationFrame(() => trash.current?.focus());
  };
  return (
    <div
      className={'place-delete' + (confirming ? ' is-confirming' : '')}
      role={confirming ? 'alertdialog' : undefined}
      aria-labelledby={confirming ? heading : undefined}
    >
      <button
        ref={trash}
        type="button"
        className="icon-button place-trash"
        aria-label={t('messages.removePlace') + ': ' + title}
        title={t('messages.removePlace')}
        disabled={busy}
        onClick={() => {
          if (confirming) dismiss();
          else setConfirming(true);
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
        >
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
        </svg>
      </button>
      {confirming && (
        <div
          className="place-delete-confirm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (!busy) dismiss();
            }
          }}
        >
          <p id={heading}>{t('messages.areYouSureYouWantToRemove')}</p>
          <div className="place-confirm-actions">
            <button
              ref={cancel}
              type="button"
              className="secondary"
              disabled={busy}
              onClick={dismiss}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api(
                    deletePath || 'media/' + mediaId + '/places/' + placeId,
                    'DELETE',
                  );
                  onDelete();
                } catch {
                  setError('messages.couldNotRemoveThePlacePleaseTry');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('common.remove')}
            </button>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
