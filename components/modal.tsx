'use client';

import { useRef, useEffect, useId, type ReactNode } from 'react';
import { useLocale } from './appearance';
import { FeedbackButton } from './feedback';

export default function Modal({
  title,
  children,
  onClose,
  wide = false,
  doubleBackdropClick = false,
  onKeyDown,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  doubleBackdropClick?: boolean;
  onKeyDown?: import('react').KeyboardEventHandler<HTMLDialogElement>;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const lastBackdropClick = useRef<number | null>(null);
  const pointerStartedOutside = useRef(false);
  const outside = (x: number, y: number) => {
    const bounds = ref.current?.getBoundingClientRect();
    return (
      !!bounds &&
      (x < bounds.left ||
        x > bounds.right ||
        y < bounds.top ||
        y > bounds.bottom)
    );
  };
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      dialog?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={'modal ' + (wide ? 'wide' : '')}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pointerStartedOutside.current =
          event.button === 0 &&
          event.target === ref.current &&
          outside(event.clientX, event.clientY);
        if (!pointerStartedOutside.current) lastBackdropClick.current = null;
      }}
      onPointerCancel={() => {
        pointerStartedOutside.current = false;
        lastBackdropClick.current = null;
      }}
      onKeyDown={(event) => {
        lastBackdropClick.current = null;
        onKeyDown?.(event);
      }}
      onInput={() => {
        lastBackdropClick.current = null;
      }}
      onClick={(event) => {
        const backdrop =
          pointerStartedOutside.current &&
          event.target === ref.current &&
          outside(event.clientX, event.clientY);
        pointerStartedOutside.current = false;
        if (!backdrop) {
          lastBackdropClick.current = null;
          return;
        }
        if (!doubleBackdropClick) {
          onClose();
          return;
        }
        const now = performance.now();
        if (
          lastBackdropClick.current !== null &&
          now - lastBackdropClick.current <= 700
        ) {
          lastBackdropClick.current = null;
          onClose();
        } else lastBackdropClick.current = now;
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <FeedbackButton
          className="icon-button"
          aria-label={t('messages.close')}
          onClick={onClose}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </FeedbackButton>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
