'use client';

import { FriendLinkArrival } from './friend-link';
import WelcomeSlideshow from './welcome-slideshow';
import { useLocale } from '@/components/appearance';
import { api } from './api';
import TripDescription from './trip-description';
import TripPreloader from './trip-preloader';
import { BackToTop } from './media-controls';
import Brand, { LogoMark } from './brand';
import { FeedbackProvider, FeedbackButton, PageFeedback } from './feedback';
import { useArchive } from './archive/use-archive';
import { Icon, date, period } from './archive/shared';
import Header from './archive/header';
import Dashboard from './archive/dashboard';
import GalleryTab from './archive/gallery-tab';
import PlacesTab from './archive/places-tab';
import JournalTab from './archive/journal-tab';
import SettingsTab from './archive/settings-tab';
import CreateDialog from './archive/create-dialog';
import FolderDialog from './archive/folder-dialog';
import InviteDialog from './archive/invite-dialog';
import LeaveDialog from './archive/leave-dialog';
import ShareDialog from './archive/share-dialog';
import MediaDialog from './archive/media-dialog';
import AuthForm from './archive/auth-form';

export default function Archive(props: { share?: string; invite?: string }) {
  return (
    <FeedbackProvider>
      <ArchiveContent {...props} />
    </FeedbackProvider>
  );
}

function ArchiveContent(props: { share?: string; invite?: string }) {
  const archive = useArchive(props);
  const { t } = useLocale();
  const {
    user,
    ready,
    bootFailed,
    data,
    setData,
    tab,
    modal,
    busy,
    register,
    activeMedia,
    invitation,
    trip,
    isOwner,
    guest,
    setNotice,
    action,
    refresh,
    openTab,
    resourceScope,
    mapResourceScope,
    share,
    invite,
  } = archive;
  const authForm = <AuthForm archive={archive} />;
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <BackToTop />
      <Header archive={archive} />
      <FriendLinkArrival userId={user?.id} />
      {!ready ? (
        <main id="main-content" tabIndex={-1} className="loading">
          <PageFeedback />
          <span className="spinner" />
          {t('trip.openingTheArchive')}
        </main>
      ) : bootFailed ? (
        <main id="main-content" tabIndex={-1} className="loading">
          <h1>{t('trip.couldNotOpenTheArchive')}</h1>
          <p>{t('trip.couldNotReachTheServerYourSign')}</p>
          <PageFeedback />
          <button
            className="secondary"
            onClick={() => window.location.reload()}
          >
            {t('common.retry')}
          </button>
        </main>
      ) : invite ? (
        <main id="main-content" tabIndex={-1} className="invite-page">
          <PageFeedback />
          <span className="eyebrow">{t('trip.goodJourneysAreShared')}</span>
          <h1>{invitation?.title || t('trip.tripInvitation')}</h1>
          {invitation && (
            <>
              <p>
                {invitation.destination} · {period(invitation)}
              </p>
              <div className="panel">
                <h2>{t('trip.youAreInvitedOnATrip')}</h2>
                <p>{t('trip.photosAndEntriesWillBeAvailableTo')}</p>
                {user ? (
                  <FeedbackButton
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const r = await api('invites/' + invite, 'POST', {});
                        window.location.href = '/?trip=' + r.tripId;
                      })
                    }
                  >
                    {t('trip.joinTrip')}
                    <Icon name="arrow" />
                  </FeedbackButton>
                ) : (
                  <>{authForm}</>
                )}
              </div>
            </>
          )}
        </main>
      ) : !user && !guest ? (
        <main id="main-content" tabIndex={-1} className="welcome">
          <PageFeedback />
          <section className="welcome-story">
            <span className="eyebrow">{t('trip.yourTripsYourStories')}</span>
            <h1>
              {t('trip.everyPlace')}
              <br />
              {t('trip.hasItsOwn')} <em>{t('trip.story')}</em>
            </h1>
            <p>{t('trip.bringPhotosRoutesAndLittleDiscoveriesInto')}</p>
            <WelcomeSlideshow />
            <div className="welcome-details">
              <span>
                <Icon name="cloud" />
                {t('trip.originalsStayOnYourDrive')}
              </span>
              <span>
                <Icon name="users" />
                {t('trip.travelTogether')}
              </span>
            </div>
          </section>
          <section className="auth panel">
            <LogoMark className="auth-logo" />
            <span className="eyebrow">{t('trip.startYourCollection')}</span>
            <h2>{register ? t('trip.welcome') : t('trip.goodToSeeYou')}</h2>
            <p className="muted">
              {register
                ? t('trip.soManyPlacesStillToDiscover')
                : t('trip.signInToReturnToYourStories')}
            </p>
            {authForm}
          </section>
        </main>
      ) : guest && !trip ? (
        <main id="main-content" tabIndex={-1} className="invite-page">
          <PageFeedback />
          <h1>{t('trip.thisLinkIsUnavailable')}</h1>
          <p>{t('trip.theOwnerMayHaveRevokedGuestAccess')}</p>
          <a href="/">{t('trip.goHome')}</a>
        </main>
      ) : !trip ? (
        <Dashboard archive={archive} />
      ) : (
        <main id="main-content" tabIndex={-1} className="trip-page">
          <PageFeedback />
          <div className="trip-heading">
            <div>
              <span className="eyebrow">
                <Icon name="pin" size={14} />
                {trip.destination.toUpperCase()}
                <span> / </span>
                {period(trip)}
              </span>
              <h1>
                {trip.title}
                <span className="brand-dot">.</span>
              </h1>
              <TripDescription
                key={trip.id}
                tripId={trip.id}
                value={trip.description || ''}
                mentions={trip.descriptionMentions || []}
                user={user!}
                editable={isOwner && !guest}
                onSave={(description, descriptionMentions) =>
                  setData((old) =>
                    old
                      ? {
                          ...old,
                          trip: {
                            ...old.trip,
                            description,
                            descriptionMentions,
                          },
                        }
                      : old,
                  )
                }
              />
              {trip.role === 'member' && (
                <span className="pill">
                  {t('trip.yourDates')} {date(trip.from)} — {date(trip.to)}
                </span>
              )}
            </div>
            <div className="trip-summary">
              <strong>
                {data?.media.filter((m) => !m.hidden).length || 0}
              </strong>
              <span>{t('trip.photosVideos')}</span>
              <Icon name="compass" size={42} />
            </div>
          </div>
          <div className="tabbar">
            <nav aria-label={t('trip.tripSections')}>
              {[
                ['gallery', 'photo', t('trip.gallery')],
                ['places', 'compass', t('common.discoveredPlaces')],
                ['map', 'pin', t('trip.map')],
                ['notes', 'book', t('trip.journal')],
                ...(!guest
                  ? [['settings', 'settings', t('trip.membersDrives')]]
                  : []),
              ].map(([key, icon, title]) => (
                <FeedbackButton
                  key={key}
                  className={tab === key ? 'active' : ''}
                  aria-current={tab === key ? 'page' : undefined}
                  onClick={() => {
                    openTab(key);
                  }}
                >
                  <Icon name={icon} size={18} />
                  {title}
                </FeedbackButton>
              ))}
            </nav>
            {!guest && (
              <div className="archive-refresh">
                <FeedbackButton
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result = await api(
                        'trips/' + trip.id + '/sync',
                        'POST',
                      );
                      await refresh();
                      setNotice(
                        t(
                          result.failed
                            ? 'trip.somePhotosCouldNotBeLoadedPlease'
                            : 'trip.archiveRefreshed',
                        ),
                      );
                    })
                  }
                >
                  <Icon name="refresh" size={16} />
                  {t('trip.loadNewPhotos')}
                </FeedbackButton>
              </div>
            )}
          </div>
          {data && (
            <TripPreloader
              data={data}
              scope={resourceScope}
              mapScope={mapResourceScope}
              userId={user?.id}
              guest={guest}
              share={share}
            />
          )}
          <GalleryTab archive={archive} />
          <PlacesTab archive={archive} />
          {tab === 'notes' && <JournalTab archive={archive} />}
          <SettingsTab archive={archive} />
        </main>
      )}
      <footer>
        <Brand footer />
        <p>{t('common.moreThanWhereYouWentHowIt')}</p>
        <a href="/about">{t('navigation.about')}</a>
      </footer>
      {modal === 'create' && <CreateDialog archive={archive} />}
      {modal === 'source' && <FolderDialog archive={archive} />}
      {(modal === 'invite' || modal.startsWith('member:')) && (
        <InviteDialog archive={archive} />
      )}
      {modal === 'share' && <LeaveDialog archive={archive} />}
      {modal === 'leave' && <ShareDialog archive={archive} />}
      {activeMedia && <MediaDialog archive={archive} />}
    </>
  );
}
