'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';

export function BackToTop() {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector('header.topbar');
      const headerAbove = header
        ? header.getBoundingClientRect().bottom <= 0
        : window.scrollY > 0;
      const recycledRows = [
        ...document.querySelectorAll<HTMLElement>(
          '.virtual-gallery[data-base-row], .virtual-places[data-base-row]',
        ),
      ].some((element) => Number(element.dataset.baseRow) > 0);
      setVisible(headerAbove || recycledRows);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('questkeeps:virtual-scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('questkeeps:virtual-scroll', schedule);
    };
  }, []);
  if (!visible) return null;
  return (
    <button
      type="button"
      className="back-to-top"
      aria-label={t('messages.backToTop')}
      title={t('messages.backToTop')}
      onClick={() => {
        window.dispatchEvent(new Event('questkeeps:gallery-start'));
        window.scrollTo({ top: 0, behavior: 'instant' });
        const header = document.querySelector<HTMLElement>('header.topbar');
        header?.focus({ preventScroll: true });
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </svg>
    </button>
  );
}

export function FavoriteButton({
  id,
  favorite,
  onChange,
}: {
  id: string;
  favorite: boolean;
  onChange: (favorite: boolean) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        type="button"
        className="favorite-button"
        aria-label={t(
          favorite ? 'messages.removeFromFavorites' : 'messages.addToFavorites',
        )}
        aria-pressed={favorite}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await api('media/' + id + '/favorite', 'PATCH', {
              favorite: !favorite,
            });
            onChange(result.favorite);
          } catch {
            setError('messages.couldNotSaveYourFavoritePleaseTry');
          } finally {
            setBusy(false);
          }
        }}
      >
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3.2 9.6l6.3-.9Z" />
        </svg>
      </button>
      {error && (
        <span className="favorite-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

export function MediaTitle({
  id,
  title,
  editable,
  onSave,
}: {
  id: string;
  title: string;
  editable: boolean;
  onSave: (title: string) => void;
}) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  const finish = () => {
    setEditing(false);
    requestAnimationFrame(() => pencil.current?.focus());
  };
  const save = async () => {
    if (busy) return;
    if (!value.trim()) {
      setError('messages.enterATitle');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('media/' + id, 'PATCH', { title: value.trim() });
      onSave(value.trim());
      finish();
    } catch {
      setError('messages.couldNotSaveTheTitlePleaseTry');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="editable-media-title">
      {editing ? (
        <>
          <input
            ref={input}
            aria-label={t('messages.frameTitle')}
            value={value}
            maxLength={160}
            aria-invalid={!!error}
            aria-describedby={error ? 'media-title-error' : undefined}
            disabled={busy}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish();
              }
            }}
          />
          <span className="media-title-actions">
            <button
              type="button"
              className="primary"
              aria-label={t('common.save')}
              title={t('common.save')}
              disabled={busy}
              onClick={() => void save()}
            >
              <span className="media-title-action-label">
                {t('common.save')}
              </span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </button>
            <button
              type="button"
              className="secondary"
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
              disabled={busy}
              onClick={finish}
            >
              <span className="media-title-action-label">
                {t('common.cancel')}
              </span>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
          {error && (
            <span id="media-title-error" className="field-error" role="alert">
              {error}
            </span>
          )}
        </>
      ) : (
        <>
          <span title={title}>{title}</span>
          {editable && (
            <button
              ref={pencil}
              type="button"
              className="icon-button"
              aria-label={t('messages.editTitle')}
              onClick={() => {
                setValue(title);
                setError('');
                setEditing(true);
              }}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z" />
              </svg>
            </button>
          )}
        </>
      )}
    </span>
  );
}
