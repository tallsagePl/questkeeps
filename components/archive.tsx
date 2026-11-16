'use client';

import SiteFooter from './site-footer';
import TripFollow, { FollowArrival } from './trip-follow';

import { FriendLinkArrival } from './friend-link';
import TripExample from './trip-example';
import CreateTripLink from './create-trip-link';
import { useLocale } from '@/components/appearance';
import { api } from './api';
import TripDescription from './trip-description';
import TripCover from './trip-cover';
import TripPreloader from './trip-preloader';
import { BackToTop } from './media-controls';
import { LogoMark } from './brand';
import { FeedbackProvider, FeedbackButton, PageFeedback } from './feedback';
import { useArchive } from './archive/use-archive';
import { Icon, date, period } from './archive/shared';
import Header from './archive/header';
import Dashboard from './archive/dashboard';
import FrameReviewTab from './archive/frame-review-tab';
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
import PublishDialog from './archive/publish-dialog';
import AuthForm from './archive/auth-form';
import SignupUsernameDialog from './archive/signup-username';
import { retryTripImport } from './archive/source-actions';
import OnboardingMilestones from './onboarding-milestones';
import welcomeStyles from './archive/welcome.module.css';

type ArchiveProps = {
  share?: string;
  invite?: string;
  publicHome?: boolean;
  collectionOnly?: boolean;
};

export default function Archive(props: ArchiveProps) {
  return (
    <FeedbackProvider>
      <ArchiveContent {...props} />
    </FeedbackProvider>
  );
}

function ArchiveContent(props: ArchiveProps) {
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
    canManageTrip,
    action,
    openTab,
    resourceScope,
    mapResourceScope,
    share,
    invite,
    setRegister,
    verificationEmail,
    setVerificationEmail,
  } = archive;
  const authForm = <AuthForm archive={archive} />;
  const showWelcome =
    ((!ready || bootFailed) && props.publicHome) ||
    (ready &&
      !bootFailed &&
      !invite &&
      !guest &&
      !user &&
      !props.collectionOnly);
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <BackToTop />
      <Header archive={archive} collectionCurrent={props.collectionOnly} />
      {!guest && !invite && ready && (
        <OnboardingMilestones
          userId={user?.id}
          hasTrips={archive.trips.length > 0}
          hasMedia={
            isOwner &&
            !!data?.media.some(
              (item) => !item.hidden && item.user_id === user?.id,
            )
          }
        />
      )}
      <FriendLinkArrival userId={user?.id} />
      <FollowArrival userId={user?.id} />
      {showWelcome ? (
        <main id="main-content" tabIndex={-1} className={welcomeStyles.page}>
          <PageFeedback />
          <div className={welcomeStyles.hero}>
            <div>
              <h1>{t('onboarding.homeHeading')}</h1>
              <p className={welcomeStyles.lead}>{t('onboarding.homeLead')}</p>
              <div className={welcomeStyles.actions}>
                <CreateTripLink source="home" className="primary">
                  {t('onboarding.createTrip')}
                </CreateTripLink>
                <a
                  className="text-button"
                  href="#welcome-auth"
                  onClick={() => {
                    setVerificationEmail('');
                    setRegister(false);
                  }}
                >
                  {t('auth.signIn')}
                </a>
              </div>
              <a className={welcomeStyles.guide} href="/guide" hrefLang="ru">
                {t('seo.home.guide')}
              </a>
            </div>
            <TripExample />
          </div>
          <section
            id="welcome-auth"
            tabIndex={-1}
            className={`auth panel ${welcomeStyles.auth}`}
          >
            {bootFailed ? (
              <>
                <h2>{t('trip.couldNotOpenTheArchive')}</h2>
                <p>{t('trip.couldNotReachTheServerYourSign')}</p>
                <button
                  className="secondary"
                  onClick={() => window.location.reload()}
                >
                  {t('common.retry')}
                </button>
              </>
            ) : ready ? (
              <>
                <LogoMark className="auth-logo" />
                <h2>{register ? t('trip.welcome') : t('trip.goodToSeeYou')}</h2>
                {!verificationEmail && (
                  <p className="muted">
                    {register
                      ? t('trip.soManyPlacesStillToDiscover')
                      : t('trip.signInToReturnToYourStories')}
                  </p>
                )}
                {modal !== 'create-auth' && authForm}
              </>
            ) : (
              <p role="status">{t('trip.openingTheArchive')}</p>
            )}
          </section>
        </main>
      ) : !ready ? (
        <main id="main-content" tabIndex={-1} className="loading">
          <PageFeedback />
          <span className="spinner" />
          {t('trip.openingTheArchive')}
        </main>
      ) : bootFailed ? (
        <main id="main-content" tabIndex={-1} className="loading archive-error">
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
      ) : props.collectionOnly && !user ? (
        <main id="main-content" tabIndex={-1} className="social-page">
          <h1>{t('navigation.trips')}</h1>
          <div className="profile-signin">
            <p>{t('trip.signInToReturnToYourStories')}</p>
            <a className="primary" href="/#welcome-auth">
              {t('auth.signIn')}
            </a>
          </div>
        </main>
      ) : invite ? (
        <main id="main-content" tabIndex={-1} className="invite-page">
          <PageFeedback />
          <span className="eyebrow">{t('trip.goodJourneysAreShared')}</span>
          <h1>{invitation?.title || t('trip.tripInvitation')}</h1>
          {!invitation && (
            <>
              <p>{t('onboarding.inviteUnavailable')}</p>
              <a href="/">{t('trip.goHome')}</a>
            </>
          )}
          {invitation && (
            <p>
              {t(
                invitation.allPhotos
                  ? 'invitations.viewAll'
                  : 'invitations.viewPeriod',
              )}
            </p>
          )}
          {invitation && (
            <>
              <p>
                {invitation.destination} · {period(invitation)}
              </p>
              <div className="panel">
                <h2>{t('trip.youAreInvitedOnATrip')}</h2>

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
      ) : guest && !trip ? (
        <main id="main-content" tabIndex={-1} className="invite-page">
          <PageFeedback />
          <h1>{t('trip.thisLinkIsUnavailable')}</h1>
          <p>{t('trip.theOwnerMayHaveRevokedGuestAccess')}</p>
          <a href="/">{t('trip.goHome')}</a>
        </main>
      ) : !trip ? (
        <Dashboard archive={archive} collectionOnly={props.collectionOnly} />
      ) : (
        <main id="main-content" tabIndex={-1} className="trip-page">
          <PageFeedback />
          {!!trip.covers?.length && (
            <div className="trip-heading-cover">
              <TripCover
                key={resourceScope + ':' + trip.id}
                covers={trip.covers}
                destination={trip.destination}
                scope={resourceScope}
              />
            </div>
          )}
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
                  {trip.canManage && <>{t('trip.manager')} · </>}
                  {t('trip.yourDates')}{' '}
                  {date(trip.participationStart || trip.from)} —{' '}
                  {date(trip.participationEnd || trip.to)}
                </span>
              )}
            </div>
            <div className="trip-heading-side">
              {canManageTrip && (
                <button
                  type="button"
                  className="secondary trip-publish-button"
                  onClick={() => archive.setModal('publish')}
                >
                  <Icon name="link" />
                  {t('exports.open')}
                </button>
              )}
              {guest && props.share && (
                <TripFollow
                  key={trip.id + ':' + (user?.id || '')}
                  token={props.share}
                  tripId={trip.id}
                  userId={user?.id}
                />
              )}
              <div className="trip-summary">
                <strong>
                  {data?.media.filter((m) => !m.hidden).length || 0}
                </strong>
                <span>{t('trip.photosVideos')}</span>
              </div>
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
                  ? [
                      ['review', 'photo', t('frameReview.title')],
                      ['settings', 'settings', t('trip.membersDrives')],
                    ]
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
                  disabled={busy || archive.importing}
                  onClick={() => retryTripImport(archive)}
                >
                  <Icon name="refresh" size={16} />
                  {t('trip.loadNewPhotos')}
                </FeedbackButton>
                {archive.importing && (
                  <span className="fine" role="status">
                    {t(
                      data?.importStatus?.metadataPending
                        ? 'sync.metadataProgress'
                        : 'sync.scanProgress',
                      {
                        count:
                          data?.importStatus?.metadataPending ||
                          data?.importStatus?.scanned ||
                          0,
                      },
                    )}
                  </span>
                )}
                {!archive.importing && !!data?.importStatus?.metadataErrors && (
                  <span className="fine" role="status">
                    {t('sync.metadataRetry')}
                  </span>
                )}
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
          {tab === 'review' && !guest && trip && data && (
            <FrameReviewTab key={trip.id} archive={archive} />
          )}
          <SettingsTab archive={archive} />
          {guest && (
            <div className={welcomeStyles.guestAction}>
              <CreateTripLink source="guest">
                {t('onboarding.createOwnTrip')}
              </CreateTripLink>
            </div>
          )}
        </main>
      )}
      <SiteFooter />
      {(modal === 'create' || modal === 'create-auth') && (
        <CreateDialog archive={archive} />
      )}
      {modal === 'choose-username' && (
        <SignupUsernameDialog archive={archive} />
      )}
      {modal === 'source' && <FolderDialog archive={archive} />}
      {(modal === 'invite' || modal.startsWith('member:')) && (
        <InviteDialog archive={archive} />
      )}
      {modal === 'share' && <LeaveDialog archive={archive} />}
      {modal === 'leave' && <ShareDialog archive={archive} />}
      {modal === 'publish' && trip && canManageTrip && (
        <PublishDialog archive={archive} />
      )}
      {activeMedia && <MediaDialog archive={archive} />}
    </>
  );
}
