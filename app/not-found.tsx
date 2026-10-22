'use client';

import { HeaderBrand } from '@/components/brand';

import { AppearanceControls } from '@/components/appearance';
import { useLocale } from '@/components/appearance';

export default function NotFound() {
  const { t } = useLocale();
  return (
    <>
      <header className="topbar">
        <HeaderBrand />
        <AppearanceControls />
      </header>
      <main className="auth">
        <h1>{t('messages.noStoryHereYet')}</h1>
        <p>{t('messages.thisPageDoesNotExistOrIts')}</p>
        <a href="/">{t('messages.backToYourTrips')}</a>
      </main>
    </>
  );
}
