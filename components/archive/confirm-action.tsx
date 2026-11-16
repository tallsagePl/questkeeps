'use client';

import { useId, useRef, useState } from 'react';
import { useLocale } from '../appearance';
import { FeedbackButton } from '../feedback';

export default function ConfirmAction({
  label,
  message,
  confirmLabel,
  busy,
  onConfirm,
}: {
  label: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const description = useId();
  const panel = useId();
  const cancel = () => {
    setConfirming(false);
    trigger.current?.focus();
  };
  return (
    <div className="stack">
      <button
        ref={trigger}
        type="button"
        className="text-button danger"
        disabled={busy}
        aria-expanded={confirming}
        aria-controls={panel}
        onClick={() => setConfirming((value) => !value)}
      >
        {label}
      </button>
      <div
        id={panel}
        role="group"
        aria-label={confirmLabel}
        aria-describedby={confirming ? description : undefined}
        hidden={!confirming}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) cancel();
          }
        }}
      >
        {confirming && (
          <div className="stack">
            <p id={description}>{message}</p>
            <div className="place-confirm-actions">
              <button
                type="button"
                className="secondary"
                autoFocus
                disabled={busy}
                onClick={cancel}
              >
                {t('common.cancel')}
              </button>
              <FeedbackButton
                type="button"
                className="secondary danger"
                disabled={busy}
                onClick={onConfirm}
              >
                {confirmLabel}
              </FeedbackButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
