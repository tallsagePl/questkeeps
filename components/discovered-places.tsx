'use client';
import LocalizedArticle from './localized-article';
import { placeCategory, type PlaceCategory } from '../lib/place-category';
import { useContext, useEffect, useRef, useState } from 'react';
import MediaPreview from './media-preview';
import VirtualPlaces from './virtual-places';
import { PreviewPriority } from './preview-priority';
import { retryPlaceWhenIdle } from '../lib/place-resource-queue';
import { useLocale } from './appearance';
import { cachedPlaceInfo, cachedPlaceImage } from '../lib/place-client-cache';
import { placeTextContent } from '../lib/place-text';
import { usePlacePhotoSizing } from './use-place-photo-sizing';
import PlaceDelete from './place-delete';
import PhotoLocation from './photo-location';
type Place = {
  id: string;
  title: string;
  summary: string;
  url: string;
  day: string;
  media_id: string;
  lat?: number;
  lon?: number;
};
export function PlaceImage({
  endpoint,
  title,
  scope,
  inactive = false,
  onRetryIntent = () => {},
}: {
  endpoint: string;
  title: string;
  scope: string;
  inactive?: boolean;
  onRetryIntent?: () => void;
}) {
  const { t, language } = useLocale();
  const sizing = usePlacePhotoSizing();
  const eligible = useContext(PreviewPriority) !== null;
  const [attempt, setAttempt] = useState(0),
    [retry, setRetry] = useState(0);
  const [image, setImage] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false,
      objectUrl: string | undefined;
    setLoading(true);
    setImage(null);
    setFailed(false);
    void cachedPlaceInfo(endpoint, scope, language)
      .then(async (data) => {
        if (disposed) return;
        if (!data.image) throw new Error('Image unavailable');
        const blob = await cachedPlaceImage(data.image, scope);
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setImage(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, scope, language, attempt, retry]);
  useEffect(() => {
    if (!eligible || !failed || attempt >= 4) return;
    return retryPlaceWhenIdle(
      () => setAttempt((n) => n + 1),
      [1000, 2500, 10000, 30000][attempt],
    );
  }, [eligible, failed, attempt]);
  return (
    <div className="place-wiki-image" {...sizing}>
      {image && !failed ? (
        <img
          src={image}
          alt={title}
          aria-hidden={inactive}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="place-image-empty" aria-hidden={inactive}>
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="m3 9 9-6 9 6H3ZM5 10v9m5-9v9m4-9v9m5-9v9M3 21h18" />
          </svg>
          <span>
            {t(loading ? 'Загружаем изображение…' : 'Изображение недоступно')}
          </span>
        </span>
      )}
      {failed && (
        <button
          type="button"
          className="icon-button place-image-retry"
          aria-label={t('Повторить загрузку изображения')}
          title={t('Повторить загрузку изображения')}
          onPointerEnter={onRetryIntent}
          onFocus={onRetryIntent}
          onClick={() => {
            onRetryIntent();
            setAttempt(0);
            setRetry((value) => value + 1);
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17" />
          </svg>
        </button>
      )}
    </div>
  );
}
function PlacePhotos({
  place,
  endpoint,
  photoSrc,
  scope,
  onOpen,
}: {
  place: Place;
  endpoint: string;
  photoSrc?: string;
  scope: string;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const ownSizing = usePlacePhotoSizing();
  const ref = useRef<HTMLDivElement>(null),
    pointer = useRef('');
  const [near, setNear] = useState(false),
    [hovered, setHovered] = useState(false),
    [selected, setSelected] = useState(false);
  const own = !!photoSrc && (hovered || selected);
  useEffect(() => {
    if (!photoSrc) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [photoSrc]);
  return (
    <div ref={ref} className="place-image-switch" data-own-photo={own}>
      <div className="place-public-photo">
        <PlaceImage
          endpoint={endpoint}
          title={place.title}
          scope={scope}
          inactive={own}
          onRetryIntent={() => {
            setHovered(false);
            setSelected(false);
          }}
        />
      </div>
      {photoSrc && (
        <>
          <div className="place-own-photo" aria-hidden={!own} {...ownSizing}>
            {near && (
              <PreviewPriority value={own ? 0 : 1}>
                <MediaPreview src={photoSrc} kind="photo" scope={scope} />
              </PreviewPriority>
            )}
          </div>
          <button
            type="button"
            className="place-photo-toggle"
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                setHovered(true);
                setNear(true);
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') setHovered(false);
            }}
            aria-pressed={own}
            aria-label={t('Переключить фото места') + ': ' + place.title}
            onPointerDown={(event) => {
              pointer.current = event.pointerType;
            }}
            onClick={(event) => {
              if (
                pointer.current === 'mouse' ||
                (event.detail === 0 &&
                  matchMedia('(hover: hover) and (pointer: fine)').matches)
              ) {
                onOpen();
              } else {
                setSelected((value) => !value);
                setNear(true);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
export default function DiscoveredPlaces({
  places,
  imagePath,
  scope = '',
  photoPath,
  onPhotoSelect,
  photoCount,
  tripId,
  canDelete,
  onDeleted,
  geometryPath,
  targetUrl,
  onTargetReached,
}: {
  targetUrl?: string | null;
  onTargetReached?: () => void;
  tripId: string;
  canDelete: boolean;
  onDeleted: (place: Place) => void;
  geometryPath: (place: Place) => string;
  places: Place[];
  imagePath: (place: Place) => string;
  scope?: string;
  photoPath: (place: Place) => string | undefined;
  photoCount: (place: Place) => number;
  onPhotoSelect: (id: string, placeUrl: string) => void;
}) {
  const { t, language } = useLocale();
  const [category, setCategory] = useState<PlaceCategory | 'all'>('all');
  useEffect(() => {
    if (targetUrl) setCategory('all');
  }, [targetUrl]);
  const filters: { value: PlaceCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'Все места' },
    { value: 'attraction', label: 'Достопримечательности' },
    { value: 'street', label: 'Улицы' },
    { value: 'district', label: 'Районы' },
    { value: 'square', label: 'Площади' },
    { value: 'park', label: 'Парки' },
  ];
  const filteredPlaces =
    category === 'all'
      ? places
      : places.filter((place) => placeCategory(place) === category);
  return (
    <section
      className="places-section discovered-places"
      aria-label={t('Открытые места')}
    >
      {places.length > 0 && (
        <div
          className="place-category-filters"
          role="group"
          aria-label={t('Тип места')}
        >
          {filters.map((filter) => (
            <button
              type="button"
              key={filter.value}
              aria-pressed={category === filter.value}
              onClick={() => setCategory(filter.value)}
            >
              {t(filter.label)}{' '}
              <span>
                {filter.value === 'all'
                  ? places.length
                  : places.filter(
                      (place) => placeCategory(place) === filter.value,
                    ).length}
              </span>
            </button>
          ))}
        </div>
      )}
      {filteredPlaces.length ? (
        <VirtualPlaces
          key={scope + ':' + filteredPlaces.map((place) => place.url).join('|')}
          items={filteredPlaces}
          itemKey={(place) => place.url}
          resetKey={scope}
          initialItemKey={targetUrl}
          onTargetReached={onTargetReached}
          renderItem={(place) => (
            <LocalizedArticle
              place={place}
              endpoint={imagePath(place).replace('/image', '/text')}
              scope={scope}
            >
              {(place) => (
                <article
                  className="panel discovered-place"
                  key={place.id}
                  data-place-url={place.url}
                  tabIndex={-1}
                >
                  <div className="discovered-place-content">
                    <span className="eyebrow">
                      {new Date(place.day + 'T12:00:00').toLocaleDateString(
                        language === 'en' ? 'en-GB' : 'ru-RU',
                        { day: 'numeric', month: 'long' },
                      )}{' '}
                      ·{' '}
                      {(place.sourceUrl || place.url).includes(
                        'openstreetmap.org',
                      )
                        ? 'OPENSTREETMAP'
                        : 'WIKIPEDIA'}
                    </span>
                    <div className="place-photo-reference">
                      {photoPath(place) && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onPhotoSelect(place.media_id, place.url)
                          }
                        >
                          {t(photoCount(place) > 1 ? 'Ваши фото' : 'Ваше фото')}
                        </button>
                      )}
                      {Number.isFinite(place.lat) &&
                        Number.isFinite(place.lon) && (
                          <PhotoLocation
                            id={'place-' + place.id}
                            lat={place.lat!}
                            lon={place.lon!}
                            title={place.title}
                            taken={place.day}
                            heading={t('Место на карте')}
                            geometryPath={geometryPath(place)}
                          />
                        )}
                    </div>
                    <h2>{place.title}</h2>
                    <p>
                      {place.description ||
                        placeTextContent(place.summary).description}
                    </p>
                    {place.articleFailed && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={place.articleRetry}
                      >
                        {t('Повторить')}
                      </button>
                    )}
                    {place.sourceUrl && (
                      <a
                        href={place.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t(
                          place.url.includes('openstreetmap.org')
                            ? 'Источник: OpenStreetMap'
                            : 'Источник: Википедия',
                        )}{' '}
                        ↗
                      </a>
                    )}
                  </div>
                  {canDelete && (
                    <div className="discovered-place-delete">
                      <PlaceDelete
                        mediaId={place.media_id}
                        placeId={place.id}
                        title={place.title}
                        deletePath={
                          'trips/' +
                          tripId +
                          '/places/' +
                          (new URL(place.url).searchParams.get('curid') ||
                            'osm-' +
                              new URL(place.url).pathname
                                .slice(1)
                                .replace('/', '-'))
                        }
                        onDelete={() => onDeleted(place)}
                      />
                    </div>
                  )}
                  <PlacePhotos
                    key={imagePath(place)}
                    place={place}
                    onOpen={() => onPhotoSelect(place.media_id, place.url)}
                    photoSrc={photoPath(place)}
                    endpoint={imagePath(place)}
                    scope={scope}
                  />
                </article>
              )}
            </LocalizedArticle>
          )}
        />
      ) : (
        <div className="empty panel">
          <h2>
            {t(
              places.length
                ? 'Таких мест пока нет'
                : 'Здесь появятся открытые места',
            )}
          </h2>
          {places.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setCategory('all')}
            >
              {t('Показать все места')}
            </button>
          )}
          <p>
            {t(
              'Добавляйте места в просмотре фотографий — здесь соберутся их описания и изображения.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
