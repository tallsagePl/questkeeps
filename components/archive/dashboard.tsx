'use client';

import { useLocale } from '@/components/appearance';
import Friends from '../friends';
import FollowedTrips from '../followed-trips';
import { LogoMark } from '../brand';
import { FeedbackButton, PageFeedback } from '../feedback';
import { type ArchiveController } from './use-archive';
import { period, Icon } from './shared';

export default function Dashboard({ archive }: { archive: ArchiveController }) {
  const { t } = useLocale();
  const { user, trips, setModal, openTrip } = archive;

  return (
    <>
      <main id="main-content" tabIndex={-1} className="dashboard">
        <PageFeedback />
        <div className="page-intro">
          <div>
            <span className="eyebrow">{t('trip.personalCollection')}</span>
            <h1>
              {t('trip.yourTravels')}
              <span className="brand-dot">.</span>
            </h1>
            <p>{t('trip.longJourneysAndLittleDiscoveriesAllIn')}</p>
          </div>
          <FeedbackButton
            className="primary"
            onClick={() => setModal('create')}
          >
            <Icon name="plus" />
            {t('trip.newTrip')}
          </FeedbackButton>
        </div>
        {user && <Friends key={user.id} viewerId={user.id} compact />}
        {user && <FollowedTrips key={'follows:' + user.id} userId={user.id} />}
        <div className="section-line">
          <span>{t('trip.allTrips')}</span>
          <span>{String(trips.length).padStart(2, '0')}</span>
        </div>
        {trips.length ? (
          <div className="trip-grid">
            {trips.map((trip, index) => (
              <FeedbackButton
                key={trip.id}
                className="trip-card"
                onClick={() => openTrip(trip.id)}
              >
                <div className={'trip-art art-' + (index % 4)}>
                  <span className="trip-number">
                    {String(index + 1).padStart(2, '0')} / ARCHIVE
                  </span>
                  <Icon name="compass" size={80} />
                  <span className="destination-art">{trip.destination}</span>
                </div>
                <div className="trip-card-body">
                  <span className="eyebrow">{period(trip)}</span>
                  <h2>{trip.title}</h2>
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
        ) : (
          <section className="empty-collection">
            <div className="empty-art">
              <LogoMark className="empty-logo" />
              <span className="orbit orbit-one" />
              <span className="orbit orbit-two" />
            </div>
            <span className="eyebrow">
              {t('trip.theFirstPageOfYourArchive')}
            </span>
            <h2>{t('trip.whereShallWeGo')}</h2>
            <p>
              {t('trip.createATripChooseAYandexDisk')}
              <br />
              {t('trip.andInviteThePeopleYouWantTo')}
            </p>
            <FeedbackButton
              className="secondary"
              onClick={() => setModal('create')}
            >
              {t('trip.createYourFirstTrip')}
              <Icon name="arrow" />
            </FeedbackButton>
          </section>
        )}
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
      </main>
    </>
  );
}
