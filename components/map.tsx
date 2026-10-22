'use client';

import {
  cachedPlaceDescription,
  cachedMapGeometry,
  cachedMapSuggestions,
  invalidateMapResource,
} from '../lib/place-client-cache';
import { suggestedMapAreas, type AreaCandidate } from './suggested-map-areas';
import { useLocale } from '@/components/appearance';

import { useEffect, useMemo, useRef, useState } from 'react';
import MapThumbnail from './map-thumbnail';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import { mapRegions, mapDateTime } from '../lib/map-regions';

type Point = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  taken: string;
  kind?: string;
  author?: string;
  title?: string;
  revision?: string;
  capture_time?: string | null;
  map_city?: {
    key: string;
    name: string;
    names?: Partial<Record<'ru' | 'en', string>>;
  } | null;
};

export default function TravelMap({
  points,
  onSelect,
  compact = false,
  previewPath,
  previewScope = '',
  geometryPaths,
  onGeometrySelect,
  suggestionPath,
  resourceScope,
  onAddArea,
}: {
  suggestionPath?: string;
  resourceScope?: string;
  onAddArea?: (areaId: string) => Promise<void>;
  onGeometrySelect?: (endpoint: string) => void;
  geometryPaths?: string[];
  points: Point[];
  onSelect: (id: string) => void;
  compact?: boolean;
  previewPath?: (point: Point) => string;
  previewScope?: string;
}) {
  const { t, language } = useLocale();
  const regions = useMemo(
    () => mapRegions(points, language),
    [points, language],
  );
  const mapScope = resourceScope || previewScope;
  const viewKey =
    'questkeeps:map-view:v2:' +
    previewScope +
    ':' +
    (suggestionPath || (geometryPaths || []).join('|'));
  const [selectedRegion, setSelectedRegion] = useState(() => {
    if (compact) return 'all';
    try {
      return (
        JSON.parse(
          (previewScope.startsWith('guest:')
            ? null
            : localStorage.getItem(viewKey)) || 'null',
        )?.region || 'all'
      );
    } catch {
      return 'all';
    }
  });
  const restoredView = useRef('');
  useEffect(() => {
    if (compact) return;
    try {
      const saved = JSON.parse(
        (previewScope.startsWith('guest:')
          ? null
          : localStorage.getItem(viewKey)) || 'null',
      );
      setSelectedRegion(saved?.region || 'all');
    } catch {}
    restoredView.current = viewKey;
  }, [viewKey, compact]);
  useEffect(() => {
    if (compact || restoredView.current !== viewKey) return;
    try {
      if (!previewScope.startsWith('guest:'))
        localStorage.setItem(
          viewKey,
          JSON.stringify({ region: selectedRegion }),
        );
    } catch {}
  }, [selectedRegion, viewKey, compact]);
  const [mapReady, setMapReady] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const mapHandle = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());
  const activeMarker = useRef<string | null>(null);
  const region = regions.find((group) => group.key === selectedRegion);
  const shownPoints = region?.points || points;
  const ref = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const geometryCallback = useRef(onGeometrySelect);
  geometryCallback.current = onGeometrySelect;
  const selectedGeometry = useRef<string | null>(null);
  useEffect(() => {
    let map: LeafletMap | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, {
        scrollWheelZoom: true,
        zoomControl: false,
      }).setView([42.3, 43.3], 6);
      L.control
        .zoom({
          zoomInTitle: t('common.zoomIn'),
          zoomOutTitle: t('common.zoomOut'),
        })
        .addTo(map);
      map.createPane('visitedPlaces').style.zIndex = '350';
      map.createPane('suggestedPlaces').style.zIndex = '340';
      map.createPane('suggestedStreets').style.zIndex = '360';
      mapHandle.current = map;
      resizeObserver = new ResizeObserver(() => {
        if (!map || cancelled) return;
        map.invalidateSize({ animate: false, pan: true });
        map.eachLayer((layer) => {
          if (layer instanceof L.Popup && layer.isOpen()) layer.update();
        });
      });
      resizeObserver.observe(ref.current);
      map.attributionControl.setPrefix(false);
      const creditControl = map.attributionControl.getContainer();
      if (creditControl) {
        L.DomEvent.disableClickPropagation(creditControl);
        L.DomEvent.disableScrollPropagation(creditControl);
      }
      map.on('zoomend', () => {
        if (ref.current && map)
          ref.current.dataset.zoom = String(map.getZoom());
      });
      const providers = [
        {
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
          attribution:
            '<span class="map-credit-links">© <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></span> <details class="map-credits"><summary aria-label="' +
            t('map.sourcesLabel') +
            '">' +
            t('map.sources') +
            '</summary><div>Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, © OpenStreetMap contributors, and the GIS User Community.</div></details>',
        },
        {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      ];
      let source = 0;
      let layer: L.TileLayer | undefined;
      setUnavailable(false);
      const showProvider = (index: number) => {
        if (!map || cancelled) return;
        source = index;
        if (layer) map.removeLayer(layer);
        layer = L.tileLayer(providers[index].url, {
          attribution: providers[index].attribution,
          maxZoom: 19,
          referrerPolicy: 'origin',
          updateWhenIdle: true,
          keepBuffer: 1,
        })
          .on('tileerror', () => {
            if (cancelled || index !== source) return;
            if (index + 1 < providers.length) showProvider(index + 1);
            else setUnavailable(true);
          })
          .addTo(map);
      };
      showProvider(0);
      const bounds: L.LatLngExpression[] = [];
      for (const p of points) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
        const position: [number, number] = [p.lat, p.lon];
        bounds.push(position);
        const marker = L.circleMarker(position, {
          radius: 9,
          color: '#fff',
          weight: 3,
          fillColor: '#3448f5',
          fillOpacity: 1,
        }).addTo(map);
        const label = document.createElement('span');
        label.textContent =
          (p.title || p.name) +
          ' · ' +
          mapDateTime(p.taken, p.capture_time, language);
        if (compact) {
          marker.bindPopup(label, {
            minWidth: 160,
            maxWidth: 280,
            className: 'photo-map-popup',
          });
        } else {
          marker.bindTooltip(label, {
            className: 'photo-map-tooltip',
            direction: 'top',
          });
          marker.on('mouseover', () => highlight(p.id));
          marker.on('mouseout', () => highlight(null));
        }
        markers.current.set(p.id, marker);
        const markerElement = marker.getElement();
        if (markerElement) markerElement.setAttribute('data-media-id', p.id);
        marker.on('click', () => callback.current(p.id));
      }
      if (bounds.length)
        map.fitBounds(L.latLngBounds(bounds), {
          padding: [45, 45],
          maxZoom: compact ? 16 : 13,
        });
      setMapReady((value) => value + 1);
    });
    return () => {
      mapHandle.current = null;
      markers.current.clear();
      activeMarker.current = null;
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [points, t, compact, retry]);
  const [geometryMissing, setGeometryMissing] = useState(false);
  const [geometryLoading, setGeometryLoading] = useState(false);
  const [geometryTitles, setGeometryTitles] = useState<string[]>([]);
  const [geometryKinds, setGeometryKinds] = useState({
    street: false,
    district: false,
  });
  const [geometryRetry, setGeometryRetry] = useState(0);
  const geometryKey = (geometryPaths || []).join('|');
  useEffect(() => {
    let cancelled = false;
    const layers: import('leaflet').GeoJSON[] = [];
    const groups = new Map<string, { paint: () => void }>();
    setGeometryMissing(false);
    setGeometryTitles([]);
    setGeometryKinds({ street: false, district: false });
    setGeometryLoading(false);
    const map = mapHandle.current;
    if (!map || !geometryKey) return;
    setGeometryLoading(true);
    void (async () => {
      const L = await import('leaflet');
      let missing = false;
      const missingTitles: string[] = [];
      const kinds = { street: false, district: false };
      for (const endpoint of geometryKey.split('|')) {
        if (cancelled) break;
        try {
          const collection = await cachedMapGeometry(endpoint, mapScope);
          if (cancelled) break;
          if (!collection.features?.length) {
            missing = true;
            if (collection.title) missingTitles.push(collection.title);
            continue;
          }
          for (const feature of collection.features) {
            if (feature.properties?.kind === 'district') kinds.district = true;
            else kinds.street = true;
          }
          setGeometryKinds({ ...kinds });
          let hovered = false;
          let focused = false;
          let layer: import('leaflet').GeoJSON;
          const paint = () => {
            const active =
              hovered || focused || selectedGeometry.current === endpoint;
            layer.setStyle((feature) => ({
              color: active
                ? '#e5ae00'
                : feature?.properties.kind === 'district'
                  ? '#7851d6'
                  : '#3448f5',
              weight:
                feature?.properties.kind === 'district'
                  ? active
                    ? 3
                    : 2
                  : active
                    ? 7
                    : 5,
              opacity: 1,
              fillColor: active ? '#ffd447' : '#7851d6',
              fillOpacity: active ? 0.25 : 0.15,
            }));
          };
          const select = () => {
            selectedGeometry.current = endpoint;
            groups.forEach((group) => group.paint());
            geometryCallback.current?.(endpoint);
          };
          layer = L.geoJSON(collection, {
            pane: 'visitedPlaces',
            bubblingMouseEvents: false,
            onEachFeature: (feature, path) => {
              const label = document.createElement('span');
              label.textContent = feature.properties?.title || '';
              if (language === 'en')
                label.textContent = t(
                  feature.properties?.kind === 'district'
                    ? 'common.district'
                    : 'common.street',
                );
              path.bindTooltip(label);
              void cachedPlaceDescription(
                endpoint.replace('/geometry', '/text'),
                previewScope,
                language,
              )
                .then((info) => {
                  if (cancelled || !info.title) return;
                  label.textContent = info.title;
                  (path as import('leaflet').Path)
                    .getElement()
                    ?.setAttribute('aria-label', info.title);
                })
                .catch(() => {});
              path.on('mouseover', () => {
                hovered = true;
                paint();
              });
              path.on('mouseout', () => {
                hovered = false;
                paint();
              });
              path.on('click', select);
              path.on('add', () => {
                const element = (
                  path as import('leaflet').Path
                ).getElement() as SVGElement | undefined;
                if (!element) return;
                element.setAttribute('tabindex', '0');
                element.setAttribute('role', 'button');
                element.setAttribute(
                  'aria-label',
                  feature.properties?.title || collection.title || '',
                );
                element.setAttribute('data-geometry-endpoint', endpoint);
                element.addEventListener('focus', () => {
                  focused = true;
                  paint();
                });
                element.addEventListener('blur', () => {
                  focused = false;
                  paint();
                });
                element.addEventListener('keydown', (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    select();
                  }
                });
              });
            },
          }).addTo(map);
          groups.set(endpoint, { paint });
          paint();
          layers.push(layer);
        } catch {
          missing = true;
        }
      }
      if (!cancelled) {
        setGeometryMissing(missing);
        setGeometryTitles([...new Set(missingTitles)]);
        setGeometryLoading(false);
        if (compact && layers.length) {
          const bounds = L.latLngBounds([]);
          layers.forEach((layer) => bounds.extend(layer.getBounds()));
          if (bounds.isValid())
            map.fitBounds(bounds, { padding: [24, 24], animate: false });
        }
      }
    })();
    return () => {
      cancelled = true;
      layers.forEach((layer) => layer.remove());
    };
  }, [
    geometryKey,
    mapReady,
    compact,
    geometryRetry,
    language,
    previewScope,
    mapScope,
  ]);
  const [suggestions, setSuggestions] = useState<AreaCandidate[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const [suggestionRetry, setSuggestionRetry] = useState(0);
  const addCallback = useRef(onAddArea);
  addCallback.current = onAddArea;
  useEffect(() => {
    if (!suggestionPath) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    setSuggestionsFailed(false);
    cachedMapSuggestions(suggestionPath, mapScope)
      .then((data) => {
        if (controller.signal.aborted) return;
        setSuggestions(data.candidates || []);
        setSuggestionsFailed(!!data.incomplete);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestionsFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      });
    return () => controller.abort();
  }, [suggestionPath, geometryKey, suggestionRetry, mapScope]);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.scope !== mapScope + ':map-v1') return;
      if (detail.endpoint === suggestionPath) setSuggestionRetry((n) => n + 1);
      else if (geometryKey.split('|').includes(detail.endpoint))
        setGeometryRetry((n) => n + 1);
    };
    window.addEventListener('questkeeps:map-resource-updated', changed);
    return () =>
      window.removeEventListener('questkeeps:map-resource-updated', changed);
  }, [mapScope, suggestionPath, geometryKey]);
  const shownIds = shownPoints.map((p) => p.id).join('|');
  useEffect(() => {
    const map = mapHandle.current;
    if (!map || !suggestions.length || !onAddArea) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled) return;
      const ids = new Set(shownIds.split('|'));
      dispose = suggestedMapAreas(
        L,
        map,
        suggestions.filter((s) => s.photoIds.some((id) => ids.has(id))),
        async (id) => {
          await addCallback.current?.(id);
          setSuggestions((old) => old.filter((s) => s.id !== id));
        },
        t,
        suggestionPath,
        previewScope,
        language,
      );
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [
    mapReady,
    suggestions,
    shownIds,
    t,
    !!onAddArea,
    suggestionPath,
    previewScope,
    language,
  ]);
  function highlight(id: string | null) {
    const old = activeMarker.current
      ? markers.current.get(activeMarker.current)
      : null;
    if (old) {
      old.setRadius(9);
      old.setStyle({ color: '#fff', weight: 3, fillColor: '#3448f5' });
      if (!compact) old.closeTooltip();
    }
    activeMarker.current = id;
    setHighlightedId(id);
    const current = id ? markers.current.get(id) : null;
    if (current) {
      current.setRadius(14);
      current.setStyle({ color: '#191c26', weight: 3, fillColor: '#ffd447' });
      current.bringToFront();
      current.openTooltip();
      mapHandle.current?.panInside(current.getLatLng(), {
        padding: [40, 40],
        animate: false,
      });
    }
  }
  useEffect(() => {
    if (!compact && selectedRegion !== 'all' && !region)
      setSelectedRegion('all');
    const map = mapHandle.current;
    const targets = region?.points || points;
    if (!map || !targets.length) return;
    let south = Math.min(...targets.map((p) => p.lat));
    let north = Math.max(...targets.map((p) => p.lat));
    let west = Math.min(...targets.map((p) => p.lon));
    let east = Math.max(...targets.map((p) => p.lon));
    if (region) {
      const lat = (south + north) / 2;
      const lon = (west + east) / 2;
      const halfLat = Math.sqrt(50) / (2 * 111.32);
      const halfLon = halfLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
      south = Math.min(south, lat - halfLat);
      north = Math.max(north, lat + halfLat);
      west = Math.min(west, lon - halfLon);
      east = Math.max(east, lon + halfLon);
    }
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [40, 40], maxZoom: compact ? 16 : 13, animate: false },
    );
  }, [selectedRegion, regions, mapReady]);
  return (
    <>
      {!compact && regions.length > 0 && (
        <div
          className="map-regions"
          role="group"
          aria-label={t('map.tripAreas')}
        >
          <button
            type="button"
            aria-pressed={selectedRegion === 'all'}
            onClick={() => setSelectedRegion('all')}
          >
            {t('common.allPlaces')}
          </button>
          {regions.map((group) => (
            <button
              type="button"
              key={group.key}
              aria-pressed={selectedRegion === group.key}
              onClick={() => setSelectedRegion(group.key)}
            >
              {group.label}
              <span>{group.points.length}</span>
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        className="travel-map"
        data-region={selectedRegion}
        data-highlighted={highlightedId || undefined}
        role="region"
        aria-label={t(compact ? 'common.photoLocation' : 'map.mapOfTripPhotos')}
      />
      {(geometryKinds.street || geometryKinds.district) && (
        <div
          className="map-geometry-legend"
          aria-label={t('map.visitedPlacesOnTheMap')}
        >
          {geometryKinds.street && (
            <span>
              <i className="map-street-key" aria-hidden="true" />
              {t('map.visitedStreets')}
            </span>
          )}
          {geometryKinds.district && (
            <span>
              <i className="map-district-key" aria-hidden="true" />
              {t('map.visitedDistrictsAndSquares')}
            </span>
          )}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="map-geometry-legend">
          <span>
            <i className="map-suggestion-key" aria-hidden="true" />
            {t('map.greyPlacesCanBeAdded')}
          </span>
        </div>
      )}
      {(suggestionsLoading || geometryLoading) && (
        <div className="map-loading-status" role="status">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>
              {t(
                suggestionsLoading
                  ? 'map.findingDistrictsAndStreetsNearYourPhotos'
                  : 'map.loadingOutlinesOfVisitedPlaces',
              )}
            </strong>
            {suggestionsLoading && geometryLoading && (
              <p>{t('map.loadingOutlinesOfVisitedPlaces')}</p>
            )}
          </div>
        </div>
      )}
      {suggestionsFailed && (
        <div className="map-geometry-status">
          <p className="fine" role="status">
            {t('map.someDistrictsAndStreetsAreNotAvailable')}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              if (suggestionPath)
                await invalidateMapResource(suggestionPath, mapScope);
              setSuggestionRetry((n) => n + 1);
            }}
          >
            {t('map.findPlacesAgain')}
          </button>
        </div>
      )}
      {geometryMissing && (
        <div className="map-geometry-status">
          <p className="fine" role="status">
            {geometryTitles.length ? (
              <>
                {t('map.outlinesNotFoundYet')} {geometryTitles.join(', ')}.
              </>
            ) : (
              t('map.exactBoundariesAreUnavailableForSomePlaces')
            )}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              await Promise.all(
                geometryKey
                  .split('|')
                  .map((path) => invalidateMapResource(path, mapScope)),
              );
              setGeometryRetry((value) => value + 1);
            }}
          >
            {t('map.checkOutlinesAgain')}
          </button>
        </div>
      )}
      {unavailable && (
        <div className="map-unavailable" role="status">
          <span>{t('common.theMapIsTemporarilyUnavailable')}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {!compact && (
        <div
          ref={strip}
          className="map-photo-strip"
          role="group"
          aria-label={t('map.mapLocations')}
        >
          {shownPoints.map((point) => (
            <MapThumbnail
              key={point.id}
              point={point}
              src={previewPath?.(point)}
              scope={previewScope}
              root={strip}
              onSelect={onSelect}
              onHighlight={highlight}
            />
          ))}
        </div>
      )}
    </>
  );
}
