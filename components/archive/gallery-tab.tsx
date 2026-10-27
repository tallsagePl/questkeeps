'use client';

import type { ConfirmedPlace } from '../../lib/contracts';
import { isAreaPlace } from '../../lib/place-kind';
import { useLocale } from '@/components/appearance';
import { api } from '../api';
import VirtualGallery from '../virtual-gallery';
import MediaPreview from '../media-preview';
import TripDayCalendar from '../trip-day-calendar';
import { FavoriteButton } from '../media-controls';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';
import { date, Icon, TravelMap } from './shared';

export default function GalleryTab({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const {
    user,
    selected,
    setData,
    tab,
    filter,
    setFilter,
    galleryTarget,
    setGalleryTarget,
    day,
    setDay,
    guest,
    loadTrip,
    importing,
    openTab,
    visible,
    discoveredPlaces,
    placePhotoGroups,
    points,
    mediaPath,
    mapResourceScope,
    openMedia,
    share,
  } = archive;
  const data = archive.data!;
  const trip = archive.trip!;
  return (
    <>
      {(tab === 'gallery' || tab === 'map') && (
        <>
          <div className="gallery-toolbar">
            <div className="segmented">
              {[
                ['all', t('trip.allMoments')],
                ['photo', t('trip.photos')],
                ['video', t('trip.videos')],
                ...(!guest ? [['favorites', t('trip.favorites')]] : []),
              ].map(([key, label]) => (
                <FeedbackButton
                  key={key}
                  className={filter === key ? 'selected' : ''}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </FeedbackButton>
              ))}
            </div>
            <TripDayCalendar
              start={trip.start}
              end={trip.end}
              participationStart={
                trip.role === 'member' ? trip.participationStart : undefined
              }
              participationEnd={
                trip.role === 'member' ? trip.participationEnd : undefined
              }
              value={day}
              onChange={setDay}
            />
          </div>
          {tab === 'map' ? (
            <>
              <TravelMap
                resourceScope={mapResourceScope}
                confirmedAreaUrls={data!.places.map((place) => place.url)}
                suggestionPath={
                  !guest
                    ? '/api/trips/' + trip.id + '/area-suggestions'
                    : undefined
                }
                onAddArea={
                  !guest
                    ? async (areaId) => {
                        const result = await api<{
                          places?: ConfirmedPlace[];
                          mediaTitles?: { id: string; title: string | null }[];
                        }>('trips/' + trip.id + '/area-suggestions', 'POST', {
                          areaId,
                        });
                        if (!result.places) {
                          await loadTrip(trip.id);
                          return;
                        }
                        setData((current) => {
                          if (
                            !current ||
                            current.trip.id !== trip.id ||
                            current.trip.role !== trip.role ||
                            current.trip.from !== trip.from ||
                            current.trip.to !== trip.to
                          )
                            return current;
                          const places = new Map(
                            current.places.map((place) => [place.id, place]),
                          );
                          const visibleIds = new Set(
                            current.media.map((photo) => photo.id),
                          );
                          for (const place of result.places!)
                            if (visibleIds.has(place.media_id))
                              places.set(place.id, place);
                          const titles = new Map(
                            (result.mediaTitles || []).map((photo) => [
                              photo.id,
                              photo.title,
                            ]),
                          );
                          return {
                            ...current,
                            places: [...places.values()],
                            media: current.media.map((photo) =>
                              titles.has(photo.id)
                                ? { ...photo, title: titles.get(photo.id) }
                                : photo,
                            ),
                          };
                        });
                      }
                    : undefined
                }
                points={points}
                geometryPaths={discoveredPlaces
                  .filter((place) => isAreaPlace(place.title, place.summary))
                  .map((place) =>
                    mediaPath(
                      { id: place.media_id },
                      'places/' + place.id + '/geometry',
                    ),
                  )}
                onGeometrySelect={(endpoint) => {
                  const place = discoveredPlaces.find(
                    (item) =>
                      mediaPath(
                        { id: item.media_id },
                        'places/' + item.id + '/geometry',
                      ) === endpoint,
                  );
                  const photo = place && placePhotoGroups.get(place.url)?.[0];
                  if (photo) openMedia(photo, place.url, true);
                }}
                previewPath={(point) =>
                  mediaPath(point, 'preview') +
                  (share ? '&' : '?') +
                  'revision=' +
                  encodeURIComponent(point.revision || '1')
                }
                previewScope={share ? 'guest:' + share : 'user:' + user?.id}
                onSelect={(mid) =>
                  openMedia(data!.media.find((m) => m.id === mid))
                }
              />
              <p className="muted map-caption">
                {points.length} {t('trip.photosWithCoordinatesSelectAPointTo')}
                {!points.length &&
                  t('trip.coordinatesComeFromExifMetadataTheAuthor')}
              </p>
            </>
          ) : visible.length ? (
            <VirtualGallery
              key={selected + ':' + filter + ':' + day}
              items={visible}
              initialItemKey={filter === 'all' ? galleryTarget : undefined}
              onTargetReached={() => setGalleryTarget(null)}
              resetKey={selected + ':' + filter + ':' + day}
              itemKey={(m) => m.id}
              renderItem={(m) => (
                <div
                  className={
                    'photo-card-shell' +
                    (filter === 'favorites' ? ' has-gallery-jump' : '')
                  }
                >
                  <FeedbackButton
                    key={m.id}
                    className={'photo-card ' + (m.hidden ? 'is-hidden' : '')}
                    aria-label={
                      t(
                        m.kind === 'video'
                          ? 'common.openVideo'
                          : 'common.openPhoto',
                      ) +
                      ': ' +
                      (m.title || m.name.replace(/\.[^.]+$/, '')) +
                      ', ' +
                      date(m.taken) +
                      ', ' +
                      m.author
                    }
                    onClick={() => openMedia(m)}
                  >
                    {m.hidden ? (
                      <div className="photo-fallback">
                        {t('trip.hiddenPhoto')}
                      </div>
                    ) : (
                      <MediaPreview
                        src={
                          mediaPath(m, 'preview') +
                          (share ? '&' : '?') +
                          'revision=' +
                          encodeURIComponent(m.revision || '1')
                        }
                        scope={share ? 'guest:' + share : 'user:' + user?.id}
                        kind={m.kind}
                        rotation={m.rotation}
                      />
                    )}
                    {m.kind === 'video' && (
                      <span className="video-badge">▶ {t('trip.videos')}</span>
                    )}
                    <span className="photo-overlay">
                      <strong className="photo-filename">
                        {m.title || m.name.replace(/\.[^.]+$/, '')}
                      </strong>
                      <span className="photo-caption">
                        {date(m.taken)}
                        {m.capture_time ? ', ' + m.capture_time : ''} ·{' '}
                        {m.author}
                      </span>
                    </span>
                  </FeedbackButton>
                  {filter === 'favorites' && (
                    <button
                      type="button"
                      className="gallery-jump-button"
                      title={t('trip.goToThisFrameInTheGallery')}
                      aria-label={t('trip.goToThisFrameInTheGallery')}
                      onClick={() => {
                        setGalleryTarget(m.id);
                        setFilter('all');
                        setDay('');
                        openTab('gallery');
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M19 12H5m6-6-6 6 6 6" />
                      </svg>
                    </button>
                  )}
                  {!guest && !m.hidden && (
                    <FavoriteButton
                      id={m.id}
                      favorite={!!m.favorite}
                      onChange={(favorite) =>
                        setData((old) =>
                          old
                            ? {
                                ...old,
                                media: old.media.map((item) =>
                                  item.id === m.id
                                    ? { ...item, favorite }
                                    : item,
                                ),
                              }
                            : old,
                        )
                      }
                    />
                  )}
                </div>
              )}
            />
          ) : (
            <div className="empty panel">
              <Icon name="photo" size={46} />
              <h2>
                {filter === 'favorites'
                  ? t('trip.noFavoritesYet')
                  : data?.media.length
                    ? t('trip.noPhotosMatchTheseFiltersYet')
                    : !guest && data?.importStatus?.sourceCount
                      ? t(
                          importing
                            ? 'trip.gatheringYourTripPhotos'
                            : data.importStatus.disconnected
                              ? 'common.yandexAccountDisconnected'
                              : data.importStatus.failed
                                ? 'trip.couldNotSynchronizeTheFolder'
                                : data.importStatus.pendingApproval
                                  ? 'trip.waitingForOwnerApproval'
                                  : 'trip.folderConnected',
                        )
                      : t('trip.everyStoryStartsWithAFirstPhoto')}
              </h2>
              <p>
                {filter === 'favorites'
                  ? t('trip.starFramesToCollectThemHereAlso')
                  : data?.media.length
                    ? t('trip.changeTheFilterOrChooseAnotherDay')
                    : guest
                      ? t('trip.thisTripHasNoPublishedPhotosYet')
                      : data?.importStatus?.sourceCount
                        ? t(
                            importing
                              ? 'trip.yourFolderIsConnectedPhotosAndVideos'
                              : data.importStatus.disconnected
                                ? 'trip.reconnectYandexInYourProfileToAccess'
                                : data.importStatus.failed
                                  ? 'trip.theFolderIsConnectedButSynchronizationFailed'
                                  : data.importStatus.pendingApproval
                                    ? 'trip.theFolderHasBeenAddedPhotosWill'
                                    : 'trip.noPhotosWereFoundInTheFolder',
                          )
                        : t('trip.connectAYandexDiskFolderPhotosAnd')}
              </p>
              {!guest &&
                !data?.media.length &&
                (importing ? (
                  <p className="analysis-status" role="status">
                    <span className="spinner" />
                    {t('trip.synchronizing')}
                  </p>
                ) : (
                  <FeedbackButton
                    className="secondary"
                    onClick={() => openTab('settings')}
                  >
                    <Icon name="cloud" />
                    {t(
                      data?.importStatus?.sourceCount
                        ? 'trip.checkSynchronization'
                        : 'trip.connectFolder',
                    )}
                  </FeedbackButton>
                ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
