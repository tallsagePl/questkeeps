'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { removeLeafletMap } from '../lib/leaflet-lifecycle';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useLocale } from './appearance';
import { FeedbackForm, FeedbackButton, Field } from './feedback';

type Position = { lat: number; lon: number };

function MapIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />
    </svg>
  );
}

function LocationMap({
  initial,
  value,
  onChange,
}: {
  initial: Position | null;
  value: Position | null;
  onChange: (point: Position) => void;
}) {
  const { t } = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const select = useRef(onChange);
  select.current = onChange;
  const current = useRef(value);
  current.current = value;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const putMarker = useRef<(point: Position | null) => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let instance: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;
    setReady(false);
    setFailed(false);
    void import('leaflet')
      .then((L) => {
        if (disposed || !host.current) return;
        const starting = current.current || initial;
        instance = L.map(host.current, {
          scrollWheelZoom: false,
          zoomControl: false,
        }).setView(
          starting ? [starting.lat, starting.lon] : [30, 10],
          starting ? 14 : 2,
        );
        map.current = instance;
        L.control
          .zoom({
            zoomInTitle: t('common.zoomIn'),
            zoomOutTitle: t('common.zoomOut'),
          })
          .addTo(instance);
        instance.attributionControl.setPrefix(false);
        const tile = L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
          {
            attribution:
              '© <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
            maxZoom: 19,
          },
        );
        let errors = 0;
        let fallback = false;
        tile.on('tileerror', () => {
          if (disposed) return;
          if (++errors >= 3 && !fallback && instance) {
            fallback = true;
            tile.remove();
            const backup = L.tileLayer(
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              {
                attribution:
                  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
                maxZoom: 19,
              },
            );
            backup.on('tileerror', () => {
              if (!disposed) setFailed(true);
            });
            backup.on('tileload', () => {
              if (!disposed) setFailed(false);
            });
            backup.addTo(instance);
          }
        });
        tile.addTo(instance);
        const choose = (point: { lat: number; lng: number }) =>
          select.current({
            lat: Number(Math.max(-90, Math.min(90, point.lat)).toFixed(6)),
            lon: Number(
              (((((point.lng + 180) % 360) + 360) % 360) - 180).toFixed(6),
            ),
          });
        instance.on('click', (event: import('leaflet').LeafletMouseEvent) =>
          choose(event.latlng),
        );
        putMarker.current = (point) => {
          if (!instance) return;
          if (!point) {
            marker.current?.remove();
            marker.current = null;
            return;
          }
          if (!instance.getBounds().contains([point.lat, point.lon]))
            instance.panInside([point.lat, point.lon], {
              animate: false,
              padding: [24, 24],
            });
          if (marker.current) marker.current.setLatLng([point.lat, point.lon]);
          else {
            const pin = L.marker([point.lat, point.lon], {
              draggable: true,
              autoPan: true,
              title: t('messages.selectedCaptureLocation'),
              icon: L.divIcon({
                className: 'location-picker-pin',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                html: '<span></span>',
              }),
            }).addTo(instance);
            pin.on('dragend', () => choose(pin.getLatLng()));
            marker.current = pin;
          }
        };
        putMarker.current(current.current);
        resize = new ResizeObserver(() =>
          instance?.invalidateSize({ animate: false }),
        );
        resize.observe(host.current);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      putMarker.current = () => {};
      marker.current = null;
      map.current = null;
      removeLeafletMap(instance);
    };
  }, [initial?.lat, initial?.lon, retry, t]);
  useEffect(() => putMarker.current(value), [value?.lat, value?.lon, ready]);
  return (
    <div className="location-map-section">
      <p className="fine">{t('messages.clickTheMapOrDragTheMarker')}</p>
      <div
        ref={host}
        className="location-picker-map"
        role="region"
        aria-label={t('messages.chooseCaptureLocationOnMap')}
      />
      <div className="location-map-actions">
        <button
          type="button"
          className="text-button"
          disabled={!ready}
          onClick={() => {
            const centre = map.current?.getCenter();
            if (centre)
              select.current({
                lat: Number(centre.lat.toFixed(6)),
                lon: Number(
                  (((((centre.lng + 180) % 360) + 360) % 360) - 180).toFixed(6),
                ),
              });
          }}
        >
          {t('messages.selectThePointAtTheMapCentre')}
        </button>
        {failed && (
          <div className="location-map-error" role="status">
            <span>{t('common.theMapIsTemporarilyUnavailable')}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              {t('common.retry')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LocationForm({
  busy,
  initial,
  onSave,
}: {
  busy: boolean;
  initial: Position | null;
  onSave: (point: Position) => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [open, setOpen] = useState(false);
  const parsed = { lat: Number(lat), lon: Number(lon) };
  const selected =
    lat !== '' &&
    lon !== '' &&
    Number.isFinite(parsed.lat) &&
    Number.isFinite(parsed.lon) &&
    Math.abs(parsed.lat) <= 90 &&
    Math.abs(parsed.lon) <= 180
      ? parsed
      : null;
  return (
    <FeedbackForm
      className="stack location-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) onSave(selected);
      }}
    >
      <p className="muted">{t('messages.thisFileHasNoGpsDataYou')}</p>
      <div className="location-input-methods">
        <div className="form-row">
          <Field
            label={t('messages.latitude')}
            name="lat"
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            value={lat}
            onChange={(event) => setLat(event.target.value)}
          />
          <Field
            label={t('messages.longitude')}
            name="lon"
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            value={lon}
            onChange={(event) => setLon(event.target.value)}
          />
        </div>
        <div className="location-map-choice">
          {!open && <span>{t('messages.or')}</span>}
          <button
            type="button"
            className="text-button location-map-toggle"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
          >
            <MapIcon />
            {t(open ? 'messages.hideMap' : 'messages.chooseOnMap')}
          </button>
        </div>
        <FeedbackButton className="secondary location-save" disabled={busy}>
          {t('messages.saveCoordinates')}
        </FeedbackButton>
      </div>
      {open && (
        <div id={id}>
          <LocationMap
            initial={initial}
            value={selected}
            onChange={(point) => {
              setLat(String(point.lat));
              setLon(String(point.lon));
            }}
          />
        </div>
      )}
    </FeedbackForm>
  );
}
