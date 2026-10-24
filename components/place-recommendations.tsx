'use client';

import type { MediaItem, ConfirmedPlace } from '../lib/contracts';
import { hasCoordinates, type Coordinates } from '../lib/geo';

import { MemoryCache, CACHE_TTL } from '../lib/memory-cache';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { includesDate } from '../lib/date-selection';
import { useLocale } from './appearance';
import { api } from './api';
import MapThumbnail from './map-thumbnail';
import { photoSearchKey, searchPhotoPlaces } from '../lib/place-search-client';
import { ApiError, FeedbackButton, useFeedback } from './feedback';
import DismissPlaceSuggestion from './dismiss-place-suggestion';
import LocalizedArticle from './localized-article';
import { clearlyNotAttraction } from '../lib/attractions';
import {
  readSavedSearches,
  type SavedSearches,
} from '../lib/place-recommendation-store';

type Photo = MediaItem & Coordinates;

type Place = ConfirmedPlace;

type Suggestion = { pageid: number; title: string; dist: number };

type Card = { photo: Photo; place: Suggestion };

const MAX_SUGGESTIONS = 20;

function uniqueCards(cards: Card[], places: Place[], dismissed: number[]) {
  const known = new Set(places.map((place) => place.url));
  return [...cards]
    .sort((a, b) => a.place.dist - b.place.dist)
    .filter((card) => {
      if (clearlyNotAttraction(card.place.title)) return false;
      const url = 'https://ru.wikipedia.org/?curid=' + card.place.pageid;
      if (known.has(url) || dismissed.includes(card.place.pageid)) return false;
      known.add(url);
      return true;
    });
}

const cache = new MemoryCache<
  string,
  { expires: number; suggestions: Suggestion[] }
>();

export default function PlaceRecommendations({
  media,
  tripId,
  places,
  scope,
  userId,
  isOwner,
  previewPath,
  onSelect,
  onAdded,
  dayRange = '',
  headerContent,
}: {
  dayRange?: string;
  headerContent?: ReactNode;
  media: MediaItem[];
  tripId: string;
  places: Place[];
  scope: string;
  userId: string;
  isOwner: boolean;
  previewPath: (photo: Photo) => string;
  onSelect: (id: string) => void;
  onAdded: (place: Place, title?: string) => void;
}) {
  const { t, m } = useLocale();
  const feedback = useFeedback();
  const strip = useRef<HTMLDivElement>(null);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const scrollCards = (direction: number, animate = true) => {
    const root = strip.current;
    if (!root) return;
    const step =
      (root.querySelector('article')?.getBoundingClientRect().width || 260) +
      16;
    root.scrollBy({
      left: direction * step,
      behavior:
        animate && !matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'smooth'
          : 'instant',
    });
  };

  const failedPhotos = useRef(new Set<string>());
  const storageKey = 'questkeeps:dismissed-places:' + scope + ':' + tripId;
  const [dismissed, setDismissed] = useState<number[]>([]);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setDismissed(Array.isArray(value) ? value.filter(Number.isInteger) : []);
    } catch {
      setDismissed([]);
    }
  }, [storageKey]);
  const [retryAt, setRetryAt] = useState(0);
  const [checked, setChecked] = useState(0);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(
      () => {
        setRetryAt(0);
        setAttempt((value) => value + 1);
      },
      Math.max(0, retryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  const [remaining, setRemaining] = useState(true);
  const [suggestionLimit, setSuggestionLimit] = useState(MAX_SUGGESTIONS);
  const refreshPhotos = useRef(new Set<string>());
  useEffect(() => {
    refreshPhotos.current.clear();
    setSuggestionLimit(MAX_SUGGESTIONS);
  }, [scope, tripId, dayRange]);
  const completed = useRef(new Set<string>());
  const savedSearches = useRef<SavedSearches>(new Map());
  const cardSnapshot = useRef<Card[]>([]);
  const exclusions = useRef({ places, dismissed });
  exclusions.current = { places, dismissed };
  useEffect(() => {
    const update = (event: Event) => {
      if (
        Date.now() >= retryAt &&
        (event as CustomEvent).detail === tripId &&
        uniqueCards(
          cardSnapshot.current,
          exclusions.current.places,
          exclusions.current.dismissed,
        ).length < suggestionLimit
      )
        setAttempt((n) => n + 1);
    };
    window.addEventListener('questkeeps:place-search-updated', update);
    return () =>
      window.removeEventListener('questkeeps:place-search-updated', update);
  }, [tripId, retryAt, suggestionLimit]);
  const [attempt, setAttempt] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  useEffect(() => {
    const root = strip.current;
    if (!root) return;
    const update = () => {
      setCanPrevious(root.scrollLeft > 2);
      setCanNext(root.scrollLeft < root.scrollWidth - root.clientWidth - 2);
    };
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(root);
    update();
    let lastWheel = -Infinity;
    const wheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        !event.deltaY ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
        root.scrollWidth <= root.clientWidth
      )
        return;
      const canMove =
        event.deltaY > 0
          ? root.scrollLeft < root.scrollWidth - root.clientWidth - 2
          : root.scrollLeft > 2;
      if (!canMove) return;
      event.preventDefault();
      // One card per wheel gesture: small deltas must not snap back to the same card.
      if (event.timeStamp - lastWheel < 180) return;
      lastWheel = event.timeStamp;
      scrollCards(Math.sign(event.deltaY));
    };
    const surface = root.parentElement!;
    root.addEventListener('scroll', update, { passive: true });
    surface.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', update);
      surface.removeEventListener('wheel', wheel);
    };
  }, [cards.length]);
  const allPhotos = useMemo(
    () =>
      media.filter(
        (photo): photo is Photo =>
          !photo.hidden &&
          photo.kind !== 'video' &&
          hasCoordinates(photo) &&
          (isOwner || photo.user_id === userId),
      ),
    [media, isOwner, userId],
  );
  const photos = useMemo(
    () => allPhotos.filter((photo) => includesDate(photo.taken, dayRange)),
    [allPhotos, dayRange],
  );
  useEffect(() => {
    const controller = new AbortController();
    const photoKey = (photo: Photo) => photoSearchKey(photo, scope);
    const resultsKey = 'questkeeps:found-places:v2:' + scope + ':' + tripId;
    {
      completed.current.clear();
      cardSnapshot.current = [];
      try {
        savedSearches.current = readSavedSearches(
          localStorage.getItem(resultsKey),
          new Set(allPhotos.map(photoKey)),
        );
      } catch {
        savedSearches.current = new Map();
      }
    }
    // Rebuild with current photo objects and permissions; never restore deleted/hidden photos.
    cardSnapshot.current = photos.flatMap((photo) => {
      const suggestions = savedSearches.current.get(photoKey(photo));
      if (!suggestions) return [];
      completed.current.add(photoKey(photo));
      return suggestions.map((place) => ({ photo, place }));
    });
    setCards(cardSnapshot.current);
    const targets = photos.filter(
      (photo) =>
        refreshPhotos.current.has(photoKey(photo)) ||
        !completed.current.has(photoKey(photo)),
    );
    let next = 0;
    let paused = false;
    const end = targets.length;
    setLoading(true);
    setChecked(completed.current.size);
    setSearchError('');

    async function worker() {
      while (next < end && !controller.signal.aborted && !paused) {
        if (
          uniqueCards(
            cardSnapshot.current,
            exclusions.current.places,
            exclusions.current.dismissed,
          ).length >= suggestionLimit &&
          !refreshPhotos.current.size
        )
          break;
        const photo = targets[next++];
        const key = photoKey(photo);
        try {
          const refresh = refreshPhotos.current.has(key);
          let result = refresh ? undefined : cache.get(key);
          if (!result || result.expires < Date.now()) {
            const response = await searchPhotoPlaces(
              photo,
              scope,
              tripId,
              refresh,
            );
            result = {
              expires: Date.now() + CACHE_TTL,
              suggestions: response.suggestions,
            };
            if (cache.size >= 1000) cache.clear();
            cache.set(key, result);
          }
          if (!controller.signal.aborted) {
            refreshPhotos.current.delete(key);
            savedSearches.current.set(photoKey(photo), result.suggestions);
            try {
              const validKeys = new Set(allPhotos.map(photoKey));
              savedSearches.current = new Map([
                ...readSavedSearches(
                  localStorage.getItem(resultsKey),
                  validKeys,
                ),
                ...savedSearches.current,
              ]);
              localStorage.setItem(
                resultsKey,
                JSON.stringify(
                  [...savedSearches.current].filter(([key]) =>
                    validKeys.has(key),
                  ),
                ),
              );
            } catch {}
            completed.current.add(photoKey(photo));
            failedPhotos.current.delete(photo.id);
            cardSnapshot.current = [
              ...cardSnapshot.current.filter(
                (card) => card.photo.id !== photo.id,
              ),
              ...result.suggestions.map((place) => ({ photo, place })),
            ];
            setCards(cardSnapshot.current);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            failedPhotos.current.add(photo.id);
            setSearchError(
              error instanceof Error
                ? error.message
                : t('placeSearch.somePlacesCouldNotBeLoaded'),
            );
            if (
              error instanceof ApiError &&
              (error.status === 429 || error.status === 503)
            ) {
              paused = true;
              targets
                .slice(next)
                .forEach((photo) => failedPhotos.current.add(photo.id));
              setRetryAt(Date.now() + (error.status === 429 ? 60000 : 15000));
            }
            setFailed(true);
          }
        } finally {
          if (!controller.signal.aborted) setChecked((value) => value + 1);
          if (next < end && !controller.signal.aborted && !paused)
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
    void worker().then(() => {
      if (!controller.signal.aborted) {
        setRemaining(
          photos.some(
            (photo) =>
              refreshPhotos.current.has(photoKey(photo)) ||
              !completed.current.has(photoKey(photo)),
          ),
        );
        setLoading(false);
        setFailed(failedPhotos.current.size > 0);
      }
    });
    return () => controller.abort();
  }, [photos, allPhotos, scope, tripId, attempt, suggestionLimit]);
  const visible = useMemo(
    () => uniqueCards(cards, places, dismissed).slice(0, suggestionLimit),
    [cards, places, dismissed, suggestionLimit],
  );
  useEffect(() => {
    if (
      !loading &&
      checked > 0 &&
      !failed &&
      !retryAt &&
      visible.length < suggestionLimit &&
      remaining
    )
      setAttempt((value) => value + 1);
  }, [
    loading,
    checked,
    failed,
    retryAt,
    visible.length,
    remaining,
    suggestionLimit,
  ]);
  if (!allPhotos.length && !headerContent) return null;
  return (
    <section
      className="place-recommendations"
      aria-label={t('placeSearch.placesNotYetAdded')}
    >
      <div className="places-section-heading">
        <h2 tabIndex={-1}>{t('placeSearch.placesNotYetAdded')}</h2>
        {headerContent}
      </div>
      <p className="muted">
        {t('placeSearch.possiblePlacesNearYourPhotosConfirmA')}
      </p>
      {visible.length > 0 && (
        <div className="place-carousel">
          <button
            type="button"
            className="icon-button place-carousel-arrow previous"
            aria-label={t('placeSearch.previousPlaces')}
            title={t('placeSearch.previousPlaces')}
            disabled={!canPrevious}
            onClick={(event) => scrollCards(-1, event.detail !== 0)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-button place-carousel-arrow next"
            aria-label={t('placeSearch.nextPlaces')}
            title={t('placeSearch.nextPlaces')}
            disabled={!canNext}
            onClick={(event) => scrollCards(1, event.detail !== 0)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m10 6 6 6-6 6" />
            </svg>
          </button>
          <div
            className="place-recommendation-strip"
            ref={strip}
            tabIndex={0}
            role="group"
            aria-label={t('placeSearch.suggestedPlaces')}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                scrollCards(event.key === 'ArrowRight' ? 1 : -1, false);
              }
            }}
          >
            {visible.map(({ photo, place }) => (
              <LocalizedArticle
                key={place.pageid}
                place={{
                  ...place,
                  summary: '',
                  url: 'https://ru.wikipedia.org/?curid=' + place.pageid,
                }}
                endpoint={
                  '/api/media/' +
                  photo.id +
                  '/places/description?pageId=' +
                  place.pageid
                }
                scope={scope}
              >
                {(place) => (
                  <article className="place-recommendation">
                    <MapThumbnail
                      point={photo}
                      src={previewPath(photo)}
                      scope={scope}
                      root={strip}
                      onSelect={onSelect}
                      onHighlight={() => {}}
                    />
                    <div className="place-recommendation-info">
                      <h3>{place.title}</h3>
                      <span className="fine">
                        {Math.round(place.dist)} {t('common.mFromThePhoto')}
                      </span>
                      <FeedbackButton
                        type="button"
                        className="icon-button place-add"
                        aria-label={t('common.addPlace') + ': ' + place.title}
                        disabled={adding !== null}
                        onClick={async () => {
                          const feedbackScope = feedback.active.current;
                          setAdding(photo.id);
                          try {
                            const result = await api(
                              'media/' + photo.id + '/places',
                              'POST',
                              { pageId: place.pageid },
                            );
                            onAdded(result.place, result.title);
                          } catch (error) {
                            feedback.report(error, feedbackScope);
                          } finally {
                            setAdding(null);
                          }
                        }}
                      >
                        <span aria-hidden="true">+</span>
                      </FeedbackButton>
                      <DismissPlaceSuggestion
                        title={place.title}
                        onDismiss={() => {
                          const next = [...dismissed, place.pageid];
                          setDismissed(next);
                          try {
                            localStorage.setItem(
                              storageKey,
                              JSON.stringify(next),
                            );
                          } catch {}
                          requestAnimationFrame(() =>
                            strip.current
                              ?.closest('section')
                              ?.querySelector<HTMLElement>('h2')
                              ?.focus(),
                          );
                        }}
                      />
                    </div>
                    <div className="place-brief">
                      <p>
                        {place.description ||
                          place.summary ||
                          t('common.loadingDescription')}
                      </p>
                      {place.sourceUrl && (
                        <a
                          href={place.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t('common.sourceWikipedia')} ↗
                        </a>
                      )}
                      {place.articleFailed && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={place.articleRetry}
                        >
                          {t('common.retry')}
                        </button>
                      )}
                    </div>
                  </article>
                )}
              </LocalizedArticle>
            ))}
          </div>
        </div>
      )}
      {loading && (
        <p className="fine" role="status">
          {t('placeSearch.findingNearbyPlaces')} {checked}
        </p>
      )}
      {!loading && !visible.length && !failed && (
        <p className="fine">{t('placeSearch.noNewSuggestionsYet')}</p>
      )}
      {retryAt > 0 && (
        <p role="status" className="fine">
          {t('placeSearch.searchIsBrieflyPausedTheButtonWill')}
        </p>
      )}
      {failed && (
        <p role="status" className="fine">
          {searchError
            ? m(searchError)
            : t('placeSearch.somePlacesCouldNotBeLoaded')}
        </p>
      )}
      {allPhotos.length > 0 && (
        <button
          type="button"
          className="secondary"
          disabled={loading || retryAt > 0}
          onClick={() => {
            const knownCount = uniqueCards(
              cardSnapshot.current,
              places,
              dismissed,
            ).length;
            if (!remaining && !failed && knownCount <= visible.length) {
              refreshPhotos.current = new Set(
                photos.map((photo) => photoSearchKey(photo, scope)),
              );
            }
            setSuggestionLimit((value) => value + MAX_SUGGESTIONS);
            setAttempt((v) => v + 1);
          }}
        >
          {t('placeSearch.findMorePlaces')}
        </button>
      )}
    </section>
  );
}
