'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from './appearance';
import { api } from './api';
import type { RouteCity } from '../lib/route-label';
type Option = { id: string; label: string; country?: string };
function Tags({
  label,
  items,
  remove,
}: {
  label: string;
  items: Option[];
  remove: (id: string) => void;
}) {
  return (
    <ul className="destination-tags" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <span title={item.label}>{item.label}</span>
          <button
            type="button"
            aria-label={'Удалить: ' + item.label}
            onClick={() => remove(item.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
function SearchSelect({
  type,
  label,
  selected,
  countries,
  onSelect,
  disabled,
}: {
  type: 'countries' | 'cities';
  label: string;
  selected: Option[];
  countries: string[];
  onSelect: (item: Option) => void;
  disabled: boolean;
}) {
  const { language, t } = useLocale();
  const id = useId(),
    root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false),
    [items, setItems] = useState<Option[]>([]),
    [active, setActive] = useState(0),
    [error, setError] = useState('');
  const countryKey = countries.join(',');
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setActive(0);
    setError('');
    if (!open || (type === 'cities' && query.trim().length < 2))
      return () => controller.abort();
    const timer = setTimeout(() => {
      void api(
        'locations?type=' +
          type +
          '&q=' +
          encodeURIComponent(query) +
          '&language=' +
          language +
          '&countries=' +
          encodeURIComponent(countryKey),
        'GET',
        undefined,
        controller.signal,
      )
        .then((data) => setItems(data.options))
        .catch(() => {
          if (!controller.signal.aborted)
            setError(t('Не удалось загрузить список'));
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [type, query, language, countryKey, open, t]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const options = items.filter(
    (item) =>
      !selected.some(
        (value) =>
          value.id === item.id ||
          (value.label === item.label && value.country === item.country),
      ),
  );
  const choose = (item: Option) => {
    onSelect(item);
    setQuery('');
    setOpen(false);
  };
  return (
    <div className="destination-search" ref={root}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + '-list'}
        aria-activedescendant={
          open && options[active] ? id + '-' + active : undefined
        }
        value={query}
        disabled={disabled}
        maxLength={120}
        placeholder={t(
          type === 'cities' ? 'Начни вводить город' : 'Найти страну',
        )}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActive((n) =>
              Math.max(
                0,
                Math.min(
                  options.length - 1,
                  n + (e.key === 'ArrowDown' ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            if (options[active]) choose(options[active]);
          }
        }}
      />
      {open && (
        <div
          className="destination-options"
          role="listbox"
          id={id + '-list'}
          aria-label={label}
        >
          {options.map((item, i) => (
            <button
              type="button"
              role="option"
              id={id + '-' + i}
              aria-selected={active === i}
              key={item.id}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
            >
              {item.label}
              {item.country && (
                <small>
                  {' '}
                  ·{' '}
                  {new Intl.DisplayNames([language], { type: 'region' }).of(
                    item.country,
                  )}
                </small>
              )}
            </button>
          ))}
          {!options.length && (
            <p className="fine">
              {error ||
                t(
                  type === 'cities' && query.length < 2
                    ? 'Введи не меньше двух букв'
                    : 'Нет подходящих вариантов',
                )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
export default function DestinationPicker({
  onChange,
  inferredRoute,
  disabled,
  hint,
  onManualChange,
}: {
  onChange: (value: string) => void;
  onManualChange: () => void;
  inferredRoute: RouteCity[];
  disabled: boolean;
  hint: string;
}) {
  const { t, language } = useLocale();
  const [countries, setCountries] = useState<Option[]>([]),
    [cities, setCities] = useState<Option[]>([]),
    [routes, setRoutes] = useState<Option[]>([]),
    [route, setRoute] = useState('');
  useEffect(() => {
    if (!inferredRoute.length) return;
    const names = new Intl.DisplayNames([language], { type: 'region' });
    setCountries([
      ...new Map(
        inferredRoute.map((city) => [
          city.country,
          { id: city.country, label: names.of(city.country) || city.country },
        ]),
      ).values(),
    ]);
    setCities([
      ...new Map(
        inferredRoute.map((city) => [
          city.country + '|' + city.name,
          {
            id: city.country + '|' + city.name,
            label: city.names?.[language] || city.name,
            country: city.country,
          },
        ]),
      ).values(),
    ]);
    setRoutes([]);
  }, [inferredRoute, language]);
  useEffect(() => {
    const cityLabel = cities.map((item) => item.label).join(' → '),
      countryLabel = countries.map((item) => item.label).join(', '),
      routeLabel = routes.map((item) => item.label).join(' → ');
    onChange(
      [cityLabel, countryLabel, routeLabel].filter(Boolean).join(' || '),
    );
  }, [countries, cities, routes, onChange]);
  const addRoute = () => {
    onManualChange();
    const label = route.trim();
    if (label && !routes.some((item) => item.label === label)) {
      setRoutes((items) => [...items, { id: label, label }]);
      setRoute('');
    }
  };
  return (
    <fieldset className="destination-picker">
      <legend>{t('Куда едем')}</legend>
      <SearchSelect
        type="countries"
        label={t('Страна')}
        selected={countries}
        countries={[]}
        onSelect={(item) => {
          onManualChange();
          setCountries((items) => [...items, item]);
        }}
        disabled={disabled}
      />
      <Tags
        label={t('Выбранные страны')}
        items={countries}
        remove={(id) => (
          onManualChange(),
          setCountries((items) => items.filter((item) => item.id !== id))
        )}
      />
      <SearchSelect
        type="cities"
        label={t('Город')}
        selected={cities}
        countries={countries.map((item) => item.id)}
        onSelect={(item) => {
          onManualChange();
          setCities((items) => [...items, item]);
        }}
        disabled={disabled}
      />
      <Tags
        label={t('Выбранные города')}
        items={cities}
        remove={(id) => (
          onManualChange(),
          setCities((items) => items.filter((item) => item.id !== id))
        )}
      />
      <label>
        {t('Маршрут')}
        <div className="destination-route">
          <input
            aria-label={t('Маршрут')}
            value={route}
            maxLength={160}
            disabled={disabled}
            onChange={(e) => setRoute(e.target.value)}
            placeholder={t('Например, побережье Ликии')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addRoute();
              }
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={!route.trim() || disabled}
            onClick={addRoute}
          >
            {t('Добавить')}
          </button>
        </div>
      </label>
      <Tags
        label={t('Выбранные маршруты')}
        items={routes}
        remove={(id) => (
          onManualChange(),
          setRoutes((items) => items.filter((item) => item.id !== id))
        )}
      />
      <p className="fine">
        {hint ||
          t(
            'Выбирай места в порядке посещения. Маршрут добавляется кнопкой или Enter.',
          )}
      </p>
    </fieldset>
  );
}
