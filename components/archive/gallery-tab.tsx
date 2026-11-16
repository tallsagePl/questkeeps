'use client';

import { trackGoal } from '@/lib/analytics';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ConfirmedPlace, MediaItem } from '../../lib/contracts';
import { isAreaPlace } from '../../lib/place-kind';
import { useLocale } from '@/components/appearance';
import { api } from '../api';
import VirtualGallery from '../virtual-gallery';
import MediaPreview from '../media-preview';
import TripDayCalendar from '../trip-day-calendar';
import { FavoriteButton } from '../media-controls';
import { FeedbackButton } from '../feedback';
import { openSourcePicker, retryTripImport } from './source-actions';
import { type ArchiveController } from './use-archive';
import { date, Icon, TravelMap } from './shared';

function GalleryEmpty({ archive }: { archive: ArchiveController }) {
  const { t } = useLocale();
  const { filter, guest, importing, isOwner, busy, yandex } = archive;
  const data = archive.data!;
  const status = data.importStatus;
  let title = t('trip.everyStoryStartsWithAFirstPhoto');
  let description = t('trip.connectAYandexDiskFolderPhotosAnd');
  let next: ReactNode;

  if (filter === 'favorites') {
    title = t('trip.noFavoritesYet');
    description = t('trip.starFramesToCollectThemHereAlso');
  } else if (data.media.length) {
    title = t('trip.noPhotosMatchTheseFiltersYet');
    description = t('trip.changeTheFilterOrChooseAnotherDay');
  } else if (guest) {
    description = t('trip.thisTripHasNoPublishedPhotosYet');
  } else if (importing || status?.metadataWaiting) {
    title = t('trip.gatheringYourTripPhotos');
    description = t('trip.yourFolderIsConnectedPhotosAndVideos');
    next = (
      <p className="analysis-status" role="status">
        {importing && <span className="spinner" />}
        {t(importing ? 'trip.synchronizing' : 'sync.metadataRetry')}
      </p>
    );
  } else if (status?.pendingApproval) {
    title = t('trip.waitingForOwnerApproval');
    description = t(
      isOwner
        ? 'archive.approveImportHint'
        : 'trip.theFolderHasBeenAddedPhotosWill',
    );
    if (isOwner)
      next = (
        <FeedbackButton
          className="secondary"
          onClick={() => {
            archive.openTab('settings');
            requestAnimationFrame(() =>
              document.getElementById('trip-sources-heading')?.focus(),
            );
          }}
        >
          {t('archive.reviewFolders')}
        </FeedbackButton>
      );
  } else if (status?.disconnected) {
    const canReconnect = status.canReconnect && yandex;
    title = t('common.yandexAccountDisconnected');
    description = t(
      canReconnect
        ? 'archive.reconnectImportHint'
        : 'archive.disconnectedImportHint',
    );
    if (canReconnect)
      next = (
        <a
          className="secondary"
          href={
            '/api/auth/yandex?' +
            new URLSearchParams({
              intent: 'link',
              returnTo: '/?trip=' + data.trip.id,
            })
          }
        >
          {t('messages.reconnectYourYandexAccount')}
        </a>
      );
  } else if (status?.failed) {
    const canRetry = status.canRetry ?? isOwner;
    title = t('trip.couldNotSynchronizeTheFolder');
    description = t(
      canRetry ? 'archive.retryImportHint' : 'archive.failedImportHint',
    );
    if (canRetry)
      next = (
        <FeedbackButton
          className="secondary"
          disabled={busy}
          onClick={() => retryTripImport(archive)}
        >
          <Icon name="refresh" />
          {t('archive.retryImport')}
        </FeedbackButton>
      );
  } else {
    if (status?.sourceCount) {
      title = t('trip.folderConnected');
      description = t('trip.noPhotosWereFoundInTheFolder');
    }
    next = (
      <FeedbackButton
        className="secondary"
        onClick={() => openSourcePicker(archive)}
      >
        <Icon name="cloud" />
        {t(
          status?.sourceCount
            ? 'createTrip.chooseAYandexDiskFolder'
            : 'trip.connectFolder',
        )}
      </FeedbackButton>
    );
  }

  return (
    <div className="empty panel">
      <Icon name="photo" size={46} />
      <h2>{title}</h2>
      <p>{description}</p>
      {next}
    </div>
  );
}

export default function GalleryTab({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t, language } = useLocale();
  const [selection, setSelection] = useState<{
    scope: string;
    day: string;
  } | null>(null);
  const panelId = useId();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const dayList = useRef<HTMLDivElement>(null);
  const activeDayButton = useRef<HTMLButtonElement>(null);
  const {
    user,
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
  const lastGallery = useRef('');
  useEffect(() => {
    if (
      guest ||
      tab !== 'gallery' ||
      !data.media.length ||
      lastGallery.current === trip.id
    )
      return;
    lastGallery.current = trip.id;
    trackGoal('trip_gallery_ready');
  }, [guest, tab, data.media.length, trip.id]);
  const scope = trip.id + ':' + trip.role + ':' + filter + ':' + day;
  const groups = useMemo(() => {
    const grouped = new Map<string, MediaItem[]>();
    if (tab !== 'gallery') return grouped;
    for (const item of visible) {
      const key = item.taken?.slice(0, 10) || '';
      const group = grouped.get(key);
      if (group) group.push(item);
      else grouped.set(key, [item]);
    }
    return grouped;
  }, [tab, visible]);
  const target =
    filter === 'all' && galleryTarget
      ? visible.find((item) => item.id === galleryTarget)
      : undefined;
  const targetDay = target ? target.taken?.slice(0, 10) || '' : null;
  const selectedDay =
    targetDay ??
    (selection?.scope === scope && groups.has(selection.day)
      ? selection.day
      : groups.keys().next().value);
  const selectedItems =
    selectedDay === undefined ? undefined : groups.get(selectedDay);
  useEffect(() => {
    const list = dayList.current;
    const button = activeDayButton.current;
    if (!list || !button) return;
    const reveal = () => {
      const item = button.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      if (item.top < bounds.top) list.scrollTop += item.top - bounds.top - 4;
      else if (item.bottom > bounds.bottom)
        list.scrollTop += item.bottom - bounds.bottom + 4;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(list);
    return () => observer.disconnect();
  }, [groups, scope, selectedDay]);
  const dayFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: 'full',
    timeZone: 'UTC',
  });
  const shortDayFormatter = new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC',
  });
  const formatDay = (value: string, formatter: Intl.DateTimeFormat) =>
    value
      ? formatter.format(new Date(value + 'T12:00:00Z'))
      : t('trip.undatedFrames');
  const countFormatter = new Intl.NumberFormat(language);
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
              onChange={(value) => {
                setDay(value);
                trackGoal('trip_day_selected');
              }}
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
          ) : selectedDay !== undefined && selectedItems ? (
            <div className="gallery-days">
              <div
                ref={dayList}
                className="gallery-day-list"
                role="group"
                aria-label={t('calendar.tripDates')}
              >
                {[...groups].map(([groupDay, items]) => {
                  const active = selectedDay === groupDay;
                  const count = t('trip.galleryDayCount', {
                    count: countFormatter.format(items.length),
                  });
                  return (
                    <button
                      key={groupDay}
                      ref={active ? activeDayButton : undefined}
                      type="button"
                      className="gallery-day-toggle"
                      aria-pressed={active}
                      aria-controls={panelId}
                      aria-label={
                        formatDay(groupDay, dayFormatter) + ', ' + count
                      }
                      onClick={() => {
                        setSelection({ scope, day: groupDay });
                        if (galleryTarget) setGalleryTarget(null);
                        if (!active) {
                          const title = heading.current;
                          if (title && title.getBoundingClientRect().top < 0)
                            title.scrollIntoView({
                              block: 'start',
                              behavior: 'instant',
                            });
                          trackGoal('trip_day_selected');
                        }
                      }}
                    >
                      <span className="gallery-day-label">
                        <span>{formatDay(groupDay, shortDayFormatter)}</span>
                        <span className="gallery-day-count">{count}</span>
                      </span>
                      {active && <Icon name="check" size={16} />}
                    </button>
                  );
                })}
              </div>
              <section
                id={panelId}
                className="gallery-day-content"
                aria-labelledby={headingId}
              >
                <h2 ref={heading} id={headingId}>
                  {formatDay(selectedDay, dayFormatter)}
                </h2>
                <VirtualGallery
                  key={scope + ':' + selectedDay}
                  items={selectedItems}
                  initialItemKey={target ? galleryTarget : undefined}
                  onTargetReached={() => {
                    setSelection({ scope, day: selectedDay });
                    setGalleryTarget(null);
                  }}
                  resetKey={scope + ':' + selectedDay}
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
                        className={
                          'photo-card ' + (m.hidden ? 'is-hidden' : '')
                        }
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
                            scope={
                              share ? 'guest:' + share : 'user:' + user?.id
                            }
                            kind={m.kind}
                            rotation={m.rotation}
                          />
                        )}
                        {m.kind === 'video' && (
                          <span className="video-badge">
                            ▶ {t('trip.videos')}
                          </span>
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
              </section>
            </div>
          ) : (
            <GalleryEmpty archive={archive} />
          )}
        </>
      )}
    </>
  );
}
