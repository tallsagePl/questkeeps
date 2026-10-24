'use client';

import type { ReactNode } from 'react';
import HeaderDropdown from './header-dropdown';
import { AppearanceControls, useLocale } from './appearance';
import BackButton from './back-button';

export default function HeaderMenu({
  logout,
  back = false,
  guest = false,
}: {
  logout?: ReactNode;
  back?: boolean;
  guest?: boolean;
}) {
  const { t } = useLocale();
  return (
    <HeaderDropdown
      className="icon-button mobile-header-menu"
      label={t('navigation.menu')}
      trigger={
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      }
    >
      <nav
        className="header-menu-links"
        aria-label={t('navigation.mainNavigation')}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('a, .page-back')
          )
            event.currentTarget
              .closest<HTMLElement>('[popover]')
              ?.hidePopover();
        }}
      >
        {back && <BackButton />}
        <a href="/">{t('navigation.trips')}</a>
        <a href="/about">{t('navigation.about')}</a>
      </nav>
      {guest && <p className="muted">{t('trip.guestView')}</p>}
      <div className="header-menu-settings">
        <AppearanceControls />
        {logout}
      </div>
    </HeaderDropdown>
  );
}
