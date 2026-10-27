'use client';

import {
  MediaRotationControls,
  MediaArchiveDelete,
} from '../media-archive-controls';
import VideoViewer from '../video-viewer';
import { useMediaReload, MediaReloadButton } from '../media-reload';
import MediaVisibilityControls from '../media-visibility-controls';
import { Collapse } from '../smooth-details';
import { useLocale } from '@/components/appearance';
import { api } from '../api';
import PhotoViewer from '../photo-viewer';
import Modal from '../modal';
import PlaceDelete from '../place-delete';
import PhotoLocation from '../photo-location';
import { includesDate } from '../../lib/date-selection';
import ConfirmedPlaceDetails from '../confirmed-place-details';
import LocalizedArticle from '../localized-article';
import LocationForm from '../location-form';
import { distanceMeters, hasCoordinates } from '../../lib/geo';
import { MediaTitle } from '../media-controls';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';
import { Icon } from './shared';

export default function MediaDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const {
    user,
    setData,
    day,
    setDay,
    busy,
    setActiveMedia,
    setMediaPlaceUrl,
    mediaFocusPlaceUrl,
    setMediaFocusPlaceUrl,
    suggestions,
    setSuggestions,
    placesOpen,
    setPlacesOpen,
    isOwner,
    guest,
    setNotice,
    action,
    refresh,
    openTab,
    discoveredPlaces,
    placePrevious,
    placeNext,
    viewerPlacePhotos,
    viewerPlaceIndex,
    hasPlaceNavigation,
    mediaPath,
    setPlaceTarget,
    applyAddedPlace,
    navigatePlacePhoto,
    share,
  } = archive;
  const data = archive.data!;
  const activeMedia = archive.activeMedia!;
  const reload = useMediaReload(activeMedia.id);
  return (
    <>
      <Modal
        title={
          <MediaTitle
            key={activeMedia.id}
            id={activeMedia.id}
            title={
              activeMedia.title || activeMedia.name.replace(/\.[^.]+$/, '')
            }
            editable={!guest && activeMedia.user_id === user?.id}
            onSave={(title) => {
              setActiveMedia((old) => (old ? { ...old, title } : old));
              setData((old) =>
                old
                  ? {
                      ...old,
                      media: old.media.map((item) =>
                        item.id === activeMedia.id ? { ...item, title } : item,
                      ),
                    }
                  : old,
              );
            }}
          />
        }
        wide
        fullscreen
        headerCenter={
          !guest &&
          activeMedia.user_id === user?.id &&
          activeMedia.kind === 'photo' ? (
            <MediaRotationControls
              disabled={busy}
              onRotate={(step) =>
                void action(async () => {
                  const rotation =
                    ((activeMedia.rotation || 0) + step + 360) % 360;
                  await api('media/' + activeMedia.id, 'PATCH', { rotation });
                  setActiveMedia((old) =>
                    old?.id === activeMedia.id ? { ...old, rotation } : old,
                  );
                  setData((old) =>
                    old
                      ? {
                          ...old,
                          media: old.media.map((item) =>
                            item.id === activeMedia.id
                              ? { ...item, rotation }
                              : item,
                          ),
                        }
                      : old,
                  );
                })
              }
            />
          ) : undefined
        }
        headerActions={<MediaReloadButton onClick={reload.reload} />}
        onKeyDown={(event) => {
          if (
            !hasPlaceNavigation ||
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            return;
          const target = event.target as HTMLElement;
          if (
            target.closest('dialog') !== event.currentTarget ||
            target.closest(
              'input,textarea,select,[contenteditable="true"],[role="slider"]',
            )
          )
            return;
          const step =
            event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (step && viewerPlacePhotos[viewerPlaceIndex + step]) {
            event.preventDefault();
            navigatePlacePhoto(step);
          }
        }}
        onClose={() => {
          setActiveMedia(null);
          setMediaPlaceUrl(null);
          setMediaFocusPlaceUrl(null);
        }}
      >
        <div
          className={hasPlaceNavigation ? 'place-photo-navigation' : undefined}
        >
          {hasPlaceNavigation && viewerPlaceIndex > 0 && (
            <button
              ref={placePrevious}
              type="button"
              className="icon-button place-photo-previous"
              aria-label={t(
                archive.mediaPlaceUrl
                  ? 'trip.previousPhotoOfThisPlace'
                  : 'mediaArchive.previous',
              )}
              onClick={() => navigatePlacePhoto(-1)}
            >
              <Icon name="chevron-left" />
            </button>
          )}
          <div className="media-viewer">
            {activeMedia.hidden ? (
              <div className="empty">
                <p>{t('trip.thisFileIsHiddenFromTheTrip')}</p>
              </div>
            ) : activeMedia.kind === 'video' ? (
              <VideoViewer
                key={reload.key}
                src={reload.source(mediaPath(activeMedia, 'original'))}
              />
            ) : (
              <PhotoViewer
                key={reload.key}
                rotation={activeMedia.rotation}
                title={activeMedia.title || activeMedia.name}
                preview={reload.source(
                  mediaPath(activeMedia, 'preview') +
                    (share ? '&' : '?') +
                    'revision=' +
                    encodeURIComponent(activeMedia.revision || '1'),
                )}
                scope={share ? 'guest:' + share : 'user:' + user?.id}
                original={
                  [
                    'image/jpeg',
                    'image/png',
                    'image/gif',
                    'image/webp',
                    'image/avif',
                    'image/bmp',
                  ].includes(activeMedia.mime)
                    ? reload.source(mediaPath(activeMedia, 'original'))
                    : undefined
                }
              />
            )}
          </div>
          {hasPlaceNavigation &&
            viewerPlaceIndex < viewerPlacePhotos.length - 1 && (
              <button
                ref={placeNext}
                type="button"
                className="icon-button place-photo-next"
                aria-label={t(
                  archive.mediaPlaceUrl
                    ? 'trip.nextPhotoOfThisPlace'
                    : 'mediaArchive.next',
                )}
                onClick={() => navigatePlacePhoto(1)}
              >
                <Icon name="chevron-right" />
              </button>
            )}
          {hasPlaceNavigation && (
            <span
              className="place-photo-counter fine"
              role="status"
              aria-live="polite"
            >
              {t('trip.photos')} {viewerPlaceIndex + 1} /{' '}
              {viewerPlacePhotos.length}
            </span>
          )}
        </div>
        <div className="media-details">
          <div className="viewer-meta">
            <div>
              <div className="viewer-meta-line">
                <span>
                  {new Date(
                    activeMedia.taken.slice(0, 10) + 'T12:00:00',
                  ).toLocaleDateString(
                    document.documentElement.lang === 'en' ? 'en-GB' : 'ru-RU',
                    { day: 'numeric', month: 'long' },
                  )}
                  {activeMedia.capture_time
                    ? ', ' + activeMedia.capture_time
                    : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeMedia.author}</span>
                {hasCoordinates(activeMedia) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <PhotoLocation
                      id={activeMedia.id}
                      lat={activeMedia.lat}
                      lon={activeMedia.lon}
                      title={activeMedia.title || activeMedia.name}
                      taken={activeMedia.taken}
                      captureTime={activeMedia.capture_time}
                    />
                  </>
                )}
              </div>
            </div>
            {!activeMedia.hidden && (
              <a
                className="secondary"
                href={mediaPath(activeMedia, 'download')}
              >
                {t('common.downloadOriginal')}
              </a>
            )}
            {activeMedia.user_id === user?.id && !guest && (
              <MediaVisibilityControls
                feedback
                hidden={activeMedia.hidden}
                hiddenFromGuests={activeMedia.hidden_from_guests}
                disabled={busy}
                onChange={(change) =>
                  void action(async () => {
                    await api('media/' + activeMedia.id, 'PATCH', change);
                    setActiveMedia({
                      ...activeMedia,
                      ...(change.hidden !== undefined
                        ? { hidden: change.hidden }
                        : {}),
                      ...(change.hiddenFromGuests !== undefined
                        ? { hidden_from_guests: change.hiddenFromGuests }
                        : {}),
                    });
                    await refresh();
                  })
                }
              />
            )}
            {!guest && activeMedia.user_id === user?.id && (
              <MediaArchiveDelete
                key={activeMedia.id}
                disabled={busy}
                onDelete={() =>
                  void action(async () => {
                    await api('media/' + activeMedia.id, 'DELETE');
                    setActiveMedia(null);
                    setMediaPlaceUrl(null);
                    setMediaFocusPlaceUrl(null);
                    await refresh();
                  })
                }
              />
            )}
          </div>
          {!activeMedia.hidden &&
            !!data?.places.filter((place) => place.media_id === activeMedia.id)
              .length && (
              <section
                className="confirmed-photo-places"
                aria-label={t('trip.placesInThisPhoto')}
              >
                <h3>{t('trip.placesInThisPhoto')}</h3>
                {data.places
                  .filter((place) => place.media_id === activeMedia.id)
                  .map((place) => (
                    <LocalizedArticle
                      key={place.id}
                      place={place}
                      endpoint={mediaPath(
                        { id: place.media_id },
                        'places/' + place.id + '/text',
                      )}
                      scope={share ? 'guest:' + share : 'user:' + user?.id}
                    >
                      {(place) => (
                        <article
                          className="confirmed-photo-place"
                          key={place.id}
                          data-place-url={place.url}
                          data-map-selected={
                            mediaFocusPlaceUrl === place.url ? true : undefined
                          }
                          aria-label={place.title}
                          tabIndex={-1}
                        >
                          <div className="confirmed-place-heading">
                            <strong>{place.title}</strong>
                            {!guest &&
                              (isOwner || activeMedia.user_id === user?.id) && (
                                <PlaceDelete
                                  mediaId={activeMedia.id}
                                  placeId={place.id}
                                  title={place.title}
                                  onDelete={() => {
                                    setData((old) =>
                                      old
                                        ? {
                                            ...old,
                                            places: old.places.filter(
                                              (item) => item.id !== place.id,
                                            ),
                                          }
                                        : old,
                                    );
                                    const pageId = Number(
                                      new URL(place.url).searchParams.get(
                                        'curid',
                                      ),
                                    );
                                    if (pageId)
                                      setSuggestions((old) =>
                                        old.some(
                                          (item) =>
                                            Number(item.pageid) === pageId,
                                        )
                                          ? old
                                          : [
                                              ...old,
                                              {
                                                pageid: pageId,
                                                title: place.title,
                                                dist:
                                                  place.distance ??
                                                  (hasCoordinates(activeMedia)
                                                    ? distanceMeters(
                                                        activeMedia.lat,
                                                        activeMedia.lon,
                                                        place.lat,
                                                        place.lon,
                                                      )
                                                    : Number.POSITIVE_INFINITY),
                                              },
                                            ],
                                      );
                                    requestAnimationFrame(() =>
                                      document
                                        .querySelector<HTMLElement>(
                                          '.place-tools-toggle',
                                        )
                                        ?.focus(),
                                    );
                                  }}
                                />
                              )}
                          </div>
                          {activeMedia.lat !== null &&
                            activeMedia.lon !== null && (
                              <span className="fine">
                                {Math.round(
                                  place.distance ??
                                    distanceMeters(
                                      activeMedia.lat,
                                      activeMedia.lon,
                                      place.lat,
                                      place.lon,
                                    ),
                                )}{' '}
                                {t('common.mFromThePhoto')}
                              </span>
                            )}
                          <button
                            type="button"
                            className="text-button place-card-link"
                            onClick={() => {
                              if (!includesDate(place.day, day)) setDay('');
                              setPlaceTarget(place.url);
                              setActiveMedia(null);
                              openTab('places');
                            }}
                          >
                            {t('trip.goToThePlaceCard')} →
                          </button>
                          <ConfirmedPlaceDetails
                            highlighted={mediaFocusPlaceUrl === place.url}
                            title={place.title}
                            summary={place.summary}
                            url={place.url}
                            sourceUrl={place.sourceUrl}
                            scope={
                              share ? 'guest:' + share : 'user:' + user?.id
                            }
                            endpoint={(() => {
                              const canonical =
                                discoveredPlaces.find(
                                  (item) => item.url === place.url,
                                ) || place;
                              return mediaPath(
                                { id: canonical.media_id },
                                'places/' + canonical.id + '/image',
                              );
                            })()}
                          />
                        </article>
                      )}
                    </LocalizedArticle>
                  ))}
              </section>
            )}
          {!guest && !activeMedia.hidden && (
            <div className="place-tools">
              {activeMedia.lat !== null && activeMedia.lon !== null ? (
                <>
                  <div className="place-tools-heading">
                    <FeedbackButton
                      className="secondary place-tools-toggle"
                      disabled={busy}
                      aria-expanded={placesOpen}
                      aria-controls="photo-place-suggestions"
                      onClick={() => {
                        setPlacesOpen(!placesOpen);
                        if (!placesOpen && !suggestions.length)
                          void action(async () => {
                            const result = await api(
                              'media/' + activeMedia.id + '/places',
                            );
                            setSuggestions(result.suggestions);
                            setNotice('trip.nearbyPlacesLoaded');
                          });
                      }}
                    >
                      <Icon name="pin" />
                      {t(
                        placesOpen
                          ? 'trip.hidePlaces'
                          : data?.places.some(
                                (place) => place.media_id === activeMedia.id,
                              )
                            ? 'trip.addAnotherPlace'
                            : 'trip.whatSNearby',
                      )}
                    </FeedbackButton>
                    <button
                      type="button"
                      className="icon-button place-tools-chevron"
                      aria-label={t(
                        placesOpen ? 'trip.hidePlaces' : 'trip.showPlaces',
                      )}
                      aria-expanded={placesOpen}
                      aria-controls="photo-place-suggestions"
                      disabled={busy}
                      onClick={() =>
                        document
                          .querySelector<HTMLButtonElement>(
                            '.place-tools-toggle',
                          )
                          ?.click()
                      }
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        aria-hidden="true"
                      >
                        <path
                          d={placesOpen ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
                        />
                      </svg>
                    </button>
                  </div>
                  <Collapse id="photo-place-suggestions" open={placesOpen}>
                    {suggestions
                      .filter(
                        (s) =>
                          !data?.places.some(
                            (place) =>
                              place.media_id === activeMedia.id &&
                              place.url ===
                                'https://ru.wikipedia.org/?curid=' + s.pageid,
                          ),
                      )
                      .map((s) => (
                        <LocalizedArticle
                          key={s.pageid}
                          place={{
                            ...s,
                            summary: '',
                            url: 'https://ru.wikipedia.org/?curid=' + s.pageid,
                          }}
                          endpoint={
                            '/api/media/' +
                            activeMedia.id +
                            '/places/description?pageId=' +
                            s.pageid
                          }
                          scope={'user:' + user?.id}
                        >
                          {(s) => (
                            <div className="suggestion">
                              <span>
                                {s.title}
                                <small>
                                  {Math.round(s.dist)}{' '}
                                  {t('common.mFromThePhoto')}
                                </small>
                              </span>
                              {(isOwner ||
                                activeMedia.user_id === user?.id) && (
                                <FeedbackButton
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void action(async () => {
                                      const result = await api(
                                        'media/' + activeMedia.id + '/places',
                                        'POST',
                                        {
                                          pageId: s.pageid,
                                        },
                                      );
                                      applyAddedPlace(
                                        result.place,
                                        result.title,
                                      );
                                      setSuggestions((old) =>
                                        old.filter(
                                          (item) => item.pageid !== s.pageid,
                                        ),
                                      );
                                      setNotice(
                                        t(
                                          'trip.placeAndItsShortDescriptionAdded',
                                        ),
                                      );
                                    })
                                  }
                                >
                                  {t('trip.confirm')}
                                </FeedbackButton>
                              )}
                            </div>
                          )}
                        </LocalizedArticle>
                      ))}
                  </Collapse>
                </>
              ) : (
                activeMedia.user_id === user?.id && (
                  <LocationForm
                    key={activeMedia.id}
                    busy={busy}
                    initial={(() => {
                      const candidates = (data?.media || [])
                        .filter(hasCoordinates)
                        .filter((photo) => !photo.hidden && !photo.missing);
                      const target = Date.parse(activeMedia.taken);
                      const nearest = [...candidates].sort(
                        (a, b) =>
                          Math.abs(Date.parse(a.taken) - target) -
                          Math.abs(Date.parse(b.taken) - target),
                      )[0];
                      return nearest
                        ? { lat: nearest.lat, lon: nearest.lon }
                        : null;
                    })()}
                    onSave={(point) => {
                      void action(async () => {
                        await api('media/' + activeMedia.id, 'PATCH', point);
                        setActiveMedia({ ...activeMedia, ...point });
                        await refresh();
                      });
                    }}
                  />
                )
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
