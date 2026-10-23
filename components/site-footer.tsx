'use client';

import Brand from './brand';
import { useLocale } from './appearance';

export default function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer>
      <Brand footer />
      <p>{t('common.moreThanWhereYouWentHowIt')}</p>
      <a href="/about">{t('navigation.about')}</a>
    </footer>
  );
}
