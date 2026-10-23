'use client';

import SiteFooter from '@/components/site-footer';

import { HeaderBrand } from '@/components/brand';

import { AppearanceControls } from '@/components/appearance';
import { useLocale } from '@/components/appearance';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <>
      <header className="topbar">
        <HeaderBrand />
        <AppearanceControls />
      </header>
      <main className="auth">
        <h1>{t('trip.couldNotOpenTheArchive')}</h1>
        <p>{t('messages.pleaseTryAgain')}</p>
        <button onClick={reset}>{t('common.retry')}</button>
      </main>
      <SiteFooter />
    </>
  );
}
