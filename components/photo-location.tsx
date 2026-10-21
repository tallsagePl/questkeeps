'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useLocale } from './appearance';
const LocationMap = dynamic(() => import('./map'), { ssr: false });
export default function PhotoLocation({
  id,
  lat,
  lon,
  title,
  taken,
  captureTime,
  heading: suppliedHeading,
  geometryPath,
}: {
  id: string;
  lat: number;
  lon: number;
  title: string;
  taken: string;
  captureTime?: string | null;
  heading?: string;
  geometryPath?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const heading = useId();
  const points = useMemo(
    () => [{ id, lat, lon, name: title, taken, capture_time: captureTime }],
    [id, lat, lon, title, taken, captureTime],
  );
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    dialog?.showModal();
    close.current?.focus();
    return () => {
      dialog?.close();
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="text-button photo-map-trigger"
        onClick={() => setOpen(true)}
      >
        {t('Карта')}
      </button>
      {open &&
        createPortal(
          <dialog
            ref={ref}
            className="photo-location-dialog"
            aria-labelledby={heading}
            onKeyDownCapture={(e) => {
              if (
                e.key === 'Escape' &&
                !ref.current?.querySelector('.leaflet-popup')
              ) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
            onCancel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
            onClick={(e) => {
              if (e.target !== ref.current) return;
              const box = ref.current.getBoundingClientRect();
              if (
                e.clientX < box.left ||
                e.clientX > box.right ||
                e.clientY < box.top ||
                e.clientY > box.bottom
              )
                setOpen(false);
            }}
          >
            <div className="photo-location-heading">
              <h2 id={heading}>{suppliedHeading || t('Место съёмки')}</h2>
              <button
                ref={close}
                type="button"
                className="icon-button"
                aria-label={t('Закрыть карту')}
                onClick={() => setOpen(false)}
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
              </button>
            </div>
            <LocationMap
              points={points}
              compact
              onSelect={() => {}}
              geometryPaths={geometryPath ? [geometryPath] : undefined}
            />
          </dialog>,
          document.body,
        )}
    </>
  );
}
