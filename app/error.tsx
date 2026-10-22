'use client';
import { HeaderBrand } from '@/components/brand';

import { AppearanceControls } from '@/components/appearance';
import { useLocale } from '@/components/appearance';
import { translateCurrent } from '@/lib/i18n/translate';
const t = translateCurrent;
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <>
      <header className="topbar">
        <HeaderBrand />
        <AppearanceControls />
      </header>
      <main className="auth">
        <h1>{t('Не удалось открыть архив')}</h1>
        <p>{t('Попробуйте ещё раз.')}</p>
        <button onClick={reset}>{t('Повторить')}</button>
      </main>
    </>
  );
}
