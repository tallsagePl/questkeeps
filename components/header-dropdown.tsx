'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocale } from './appearance';

// Native non-modal popovers dismiss on outside press/Escape without locking the page.
export default function HeaderDropdown({
  label,
  trigger,
  triggerLabel,
  children,
  className = '',
  onOpen,
}: {
  label: string;
  trigger: ReactNode;
  triggerLabel?: string;
  children: ReactNode;
  className?: string;
  onOpen?: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const titleId = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const position = () => {
    const button = anchor.current;
    const popup = panel.current;
    if (!button || !popup) return;
    const bounds = button.getBoundingClientRect();
    if (!button.getClientRects().length || bounds.bottom <= 0) {
      popup.hidePopover();
      return;
    }
    const width = Math.min(380, window.innerWidth - 24);
    const top = Math.max(
      12,
      (button.closest('header')?.getBoundingClientRect().bottom ||
        bounds.bottom) + 8,
    );
    popup.style.setProperty('--dropdown-top', top + 'px');
    popup.style.left =
      Math.max(
        12,
        Math.min(bounds.right - width, window.innerWidth - width - 12),
      ) + 'px';
  };
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { passive: true });
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position);
    };
  }, [open]);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={className}
        aria-label={triggerLabel || label}
        aria-controls={id}
        aria-expanded={open}
        popoverTarget={id}
        onClick={position}
      >
        {trigger}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="region"
        aria-labelledby={titleId}
        className="header-dropdown-panel"
        onToggle={(event) => {
          const next = event.newState === 'open';
          setOpen(next);
          if (next) {
            position();
            onOpen?.();
          }
        }}
      >
        <div className="header-dropdown-heading">
          <h2 id={titleId}>{label}</h2>
          <button
            type="button"
            className="icon-button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label={t('messages.close')}
          >
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
        </div>
        {open && children}
      </div>
    </>
  );
}
