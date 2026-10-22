'use client';
import { HeaderBrand } from '@/components/brand';

import { AppearanceControls } from '@/components/appearance';
import { useLocale } from '@/components/appearance';
import { translateCurrent } from '@/lib/i18n/translate';
const t = translateCurrent;
export default function NotFound() {
  const { t } = useLocale();
  return (
    <>
      <header className="topbar">
        <HeaderBrand />
        <AppearanceControls />
      </header>
      <main className="auth">
        <h1>{t('Здесь пока нет истории')}</h1>
        <p>{t('Эта страница не существует или ссылка больше не действует.')}</p>
        <a href="/">{t('К путешествиям →')}</a>
      </main>
    </>
  );
}
