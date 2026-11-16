'use client';

import Memories from '../memories';
import Friends from '../friends';
import { useLocale } from '@/components/appearance';
import TripCover from '../trip-cover';
import FollowedTrips from '../followed-trips';
import { FeedbackButton, PageFeedback } from '../feedback';
import { type ArchiveController } from './use-archive';
import { period, Icon } from './shared';

export default function Dashboard({
  archive,
  collectionOnly = false,
}: {
  archive: ArchiveController;
  collectionOnly?: boolean;
}) {
  const { t } = useLocale();
  const { user, trips, setModal, openTrip } = archive;
  const empty = trips.length === 0;

  return (
    <>
      <main
        id="main-content"
        tabIndex={-1}
        className={
          trips.length <= 3 ? 'dashboard dashboard-compact' : 'dashboard'
        }
      >
        <PageFeedback />
        <div className={'page-intro' + (empty ? ' first-trip-intro' : '')}>
          <div>
            {!empty && !collectionOnly && (
              <span className="eyebrow">{t('trip.personalCollection')}</span>
            )}
            <h1>
              {t(collectionOnly ? 'navigation.trips' : 'trip.yourTravels')}
              {!collectionOnly && <span className="brand-dot">.</span>}
            </h1>
            {(empty || !collectionOnly) && (
              <p>
                {t(
                  empty
                    ? 'archive.firstTripHint'
                    : 'trip.longJourneysAndLittleDiscoveriesAllIn',
                )}
              </p>
            )}
          </div>
          <FeedbackButton
            className="primary"
            onClick={() => setModal('create')}
          >
            <Icon name="plus" />
            {t('trip.newTrip')}
          </FeedbackButton>
        </div>
        {(trips.length > 0 || collectionOnly) && (
          <div className="section-line">
            {collectionOnly ? (
              <h2 className="collection-heading">{t('trip.ownCollection')}</h2>
            ) : (
              <span>{t('trip.allTrips')}</span>
            )}
            <span>{String(trips.length).padStart(2, '0')}</span>
          </div>
        )}
        {trips.length > 0 && (
          <div className="trip-grid">
            {trips.map((trip, index) => (
              <FeedbackButton
                key={trip.id}
                className="trip-card"
                onClick={() => openTrip(trip.id)}
              >
                <TripCover
                  key={user?.id + trip.id}
                  scope={'user:' + user?.id}
                  covers={trip.covers}
                  destination={trip.destination}
                  index={index}
                />
                <div className="trip-card-body">
                  <span className="eyebrow">{period(trip)}</span>
                  {collectionOnly ? (
                    <h3 className="collection-trip-title">{trip.title}</h3>
                  ) : (
                    <h2>{trip.title}</h2>
                  )}
                  <div className="trip-meta">
                    <span>
                      <Icon name="pin" size={16} />
                      {trip.destination}
                    </span>
                    <span>
                      {trip.media_count} {t('trip.moments')}{' '}
                      <Icon name="arrow" size={18} />
                    </span>
                  </div>
                </div>
              </FeedbackButton>
            ))}
          </div>
        )}
        {!collectionOnly && user && (
          <>
            <Memories key={'memories:' + user.id} userId={user.id} />
            <Friends key={user.id} viewerId={user.id} compact />
          </>
        )}
        {user && (
          <FollowedTrips
            key={'follows:' + user.id}
            userId={user.id}
            showEmpty={collectionOnly}
          />
        )}
        {!collectionOnly && (
          <aside className="archive-note">
            <Icon name="cloud" />
            <div>
              <strong>{t('trip.memoriesHereOriginalsWithYou')}</strong>
              <p>{t('trip.connectYandexDiskFoldersTheArchiveBrings')}</p>
            </div>
            <span className="note-label">
              {t('trip.yourMemoriesTakenCareOf')}
            </span>
          </aside>
        )}
      </main>
    </>
  );
}
