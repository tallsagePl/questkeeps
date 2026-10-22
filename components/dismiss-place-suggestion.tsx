'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from './appearance';

export default function DismissPlaceSuggestion({
  title,
  onDismiss,
}: {
  title: string;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const hint = useId();
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    cancel.current?.focus();
    return () => node?.close();
  }, [open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button place-dismiss"
        aria-label={t('messages.dismissSuggestedPlace') + ': ' + title}
        title={t('messages.dismissSuggestedPlace')}
        onClick={() => setOpen(true)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="suggestion-dismiss-dialog"
          aria-labelledby={heading}
          aria-describedby={hint}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <h2 id={heading}>{t('messages.areYouSureYouWantToDismiss')}</h2>
          <strong>{title}</strong>
          <p id={hint}>{t('messages.youCanAlwaysAddItThroughThe')}</p>
          <div className="place-confirm-actions">
            <button
              ref={cancel}
              type="button"
              className="secondary"
              onClick={close}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="secondary danger"
              onClick={() => {
                setOpen(false);
                onDismiss();
              }}
            >
              {t('common.remove')}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
