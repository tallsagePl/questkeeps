'use client';
import { useEffect, useState } from 'react';
import { useLocale } from './appearance';
import { initializeNavigation, goBack } from '../lib/navigation';
export default function BackButton() {
  const { t } = useLocale();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    initializeNavigation();
    setReady(true);
  }, []);
  return (
    <button
      type="button"
      className="back text-button page-back"
      aria-label={t('Назад')}
      title={t('Назад')}
      disabled={!ready}
      onClick={goBack}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m10 6-6 6 6 6M4 12h16" />
      </svg>
      <span className="back-label">{t('Назад')}</span>
    </button>
  );
}
