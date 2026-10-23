'use client';

import TripInvitations from '../trip-invitations';
import { useLocale } from '@/components/appearance';
import { AppearanceControls } from '../appearance';
import UserAvatar from '../user-avatar';
import { signOut } from '../social-shell';
import { HeaderBrand } from '../brand';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';
import { Icon } from './shared';

export default function Header({ archive }: { archive: ArchiveController }) {
  const { t } = useLocale();
  const { user, selected, guest, action, share, invite } = archive;

  return (
    <>
      <header className="topbar" tabIndex={-1}>
        <HeaderBrand back={!!(selected || share || invite)} />
        <span className="top-caption">{t('trip.yourTravelCollection')}</span>
        <div className="top-actions">
          {user && <TripInvitations key={user.id} userId={user.id} />}
          {user && (
            <a
              className="text-button trips-nav-link"
              href="/"
              aria-current={!invite && !guest ? 'page' : undefined}
              onClick={(event) => {
                if (!selected && !invite && !guest) event.preventDefault();
              }}
            >
              {t('navigation.trips')}
            </a>
          )}
          <a className="text-button about-nav-link" href="/about">
            {t('navigation.about')}
          </a>
          {!guest && user && (
            <a
              className="text-button user-button"
              href="/profile"
              aria-label={t('profile.title')}
            >
              <UserAvatar user={user as { id: string; name: string }} />
              <span>{user.name}</span>
            </a>
          )}
          <AppearanceControls />
          {guest ? (
            <span className="pill">
              <Icon name="link" size={14} />
              {t('trip.guestView')}
            </span>
          ) : user ? (
            <>
              <FeedbackButton
                className="icon-button header-logout"
                title={t('auth.signOut')}
                aria-label={t('auth.signOut')}
                onClick={() =>
                  void action(async () => {
                    await signOut();
                  })
                }
              >
                <span>{t('auth.signOut')}</span>
                <Icon name="logout" />
              </FeedbackButton>
            </>
          ) : (
            <span className="muted">{t('trip.personalArchive')}</span>
          )}
        </div>
      </header>
    </>
  );
}
