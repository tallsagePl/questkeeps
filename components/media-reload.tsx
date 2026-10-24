'use client';

import { useState } from 'react';
import { useLocale } from './appearance';

export function useMediaReload(id: string) {
  const [request, setRequest] = useState({ id, version: 0 });
  const version = request.id === id ? request.version : 0;
  return {
    key: id + ':' + version,
    reload: () =>
      setRequest((old) => ({
        id,
        version: Math.max(Date.now(), old.version + 1),
      })),
    source: (url: string) =>
      version
        ? url + (url.includes('?') ? '&' : '?') + 'reload=' + version
        : url,
  };
}

export function MediaReloadButton({ onClick }: { onClick: () => void }) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      className="icon-button"
      onClick={onClick}
      aria-label={t('media.reload')}
      title={t('media.reload')}
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
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" />
      </svg>
    </button>
  );
}
