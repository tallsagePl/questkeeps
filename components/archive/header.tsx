'use client';

import HeaderMenu from '../header-menu';
import TripInvitations from '../trip-invitations';
import { useLocale } from '@/components/appearance';
import { AppearanceControls } from '../appearance';
import UserAvatar from '../user-avatar';
import { signOut } from '../social-shell';
import { HeaderBrand } from '../brand';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';
import { Icon } from './shared';
import { tripsCollectionPath } from '@/lib/trip-entry';

export default function Header({
  archive,
  collectionCurrent = false,
}: {
  archive: ArchiveController;
  collectionCurrent?: boolean;
}) {
  const { t } = useLocale();
  const { user, selected, guest, action, share, invite } = archive;

  return (
    <>
      <header className="topbar site-header" tabIndex={-1}>
        <HeaderMenu
          guest={guest}
          friends={!!user}
          tripsCurrent={collectionCurrent}
          logout={
            user ? (
              <FeedbackButton
                className="text-button header-logout"
                onClick={() => void action(signOut)}
              >
                {t('auth.signOut')}
              </FeedbackButton>
            ) : undefined
          }
        />
        <HeaderBrand back={!!(selected || share || invite)} />
        <span className="top-caption">{t('trip.yourTravelCollection')}</span>
        <div className="top-actions">
          {guest && (
            <span className="pill header-guest-badge">
              <Icon name="link" size={14} />
              {t('trip.guestView')}
            </span>
          )}
          {user && <TripInvitations key={user.id} userId={user.id} />}
          {user && (
            <a
              className="text-button trips-nav-link"
              href={tripsCollectionPath}
              aria-current={collectionCurrent ? 'page' : undefined}
            >
              {t('navigation.trips')}
            </a>
          )}
          {user && (
            <a
              className="text-button trips-nav-link friends-nav-link"
              href="/people/friends"
            >
              {t('friends.friends')}
            </a>
          )}
          <a className="text-button about-nav-link" href="/about">
            {t('navigation.about')}
          </a>
          {user && (
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
          {user ? (
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
