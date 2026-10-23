'use client';

import Brand from './brand';
import { useLocale } from './appearance';

export default function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer>
      <Brand footer />
      <p>{t('common.moreThanWhereYouWentHowIt')}</p>
      <nav className="footer-links" aria-label={t('navigation.footer')}>
        <a href="/about">{t('navigation.about')}</a>
        <a
          href="https://t.me/questkeepsbot"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('navigation.telegram')}
        </a>
        <a href="/privacy">{t('navigation.privacy')}</a>
      </nav>
    </footer>
  );
}
