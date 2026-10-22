'use client';
import BackButton from '@/components/back-button';

import { AppearanceControls } from '@/components/appearance';
import { useLocale } from '@/components/appearance';
import { translateCurrent } from '@/lib/i18n/translate';
const t = translateCurrent;
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <main className="auth">
      <BackButton />
      <AppearanceControls />
      <h1>{t('Не удалось открыть архив')}</h1>
      <p>{t('Попробуйте ещё раз.')}</p>
      <button onClick={reset}>{t('Повторить')}</button>
    </main>
  );
}
