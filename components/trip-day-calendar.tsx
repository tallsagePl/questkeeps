'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from './appearance';
import { dateSelection, includesDate } from '../lib/date-selection';

const parse = (day: string) => new Date(day + 'T12:00:00');

const iso = (day: Date) =>
  [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  ].join('-');

export default function TripDayCalendar({
  start,
  end,
  value,
  onChange,
}: {
  start: string;
  end: string;
  value: string;
  onChange: (day: string) => void;
}) {
  const { t, language } = useLocale();
  const locale = language === 'ru' ? 'ru-RU' : 'en-GB';
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selectedFrom, selectedTo] = dateSelection(value);
  const [month, setMonth] = useState((selectedFrom || start).slice(0, 7));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const headingId = useId();
  const fullDate = (day: string) =>
    parse(day).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    const target =
      root.current?.querySelector<HTMLButtonElement>(
        '[data-selected="true"]',
      ) ||
      root.current?.querySelector<HTMLButtonElement>(
        '[data-date]:not(:disabled)',
      );
    target?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, month]);
  const first = parse(month + '-01');
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  const shiftMonth = (by: number) => {
    const next = new Date(first);
    next.setMonth(next.getMonth() + by);
    setMonth(iso(next).slice(0, 7));
  };
  return (
    <div
      ref={root}
      className="day-filter trip-day-calendar"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <span>{t('common.tripDay')}</span>
      <button
        ref={trigger}
        type="button"
        className="secondary calendar-trigger"
        aria-label={
          t('common.tripDay') +
          ': ' +
          (value
            ? fullDate(selectedFrom) +
              (selectedTo !== selectedFrom ? ' — ' + fullDate(selectedTo) : '')
            : t('calendar.allDays'))
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => {
          if (!open) {
            setMonth((selectedFrom || start).slice(0, 7));
            setAnchor(null);
          }
          setOpen(!open);
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M7 3v4m10-4v4M3 11h18" />
        </svg>
        {value
          ? parse(selectedFrom).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
            }) +
            (selectedFrom !== selectedTo
              ? ' — ' +
                parse(selectedTo).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                })
              : '')
          : t('calendar.allDays')}
      </button>
      {open && (
        <div
          id={popupId}
          role="dialog"
          aria-labelledby={headingId}
          className="trip-calendar-popover"
        >
          <div className="trip-calendar-heading">
            <button
              type="button"
              className="icon-button"
              aria-label={t('calendar.previousMonth')}
              disabled={month <= start.slice(0, 7)}
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <strong id={headingId} aria-live="polite">
              {first.toLocaleDateString(locale, {
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label={t('calendar.nextMonth')}
              disabled={month >= end.slice(0, 7)}
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
          <p className="trip-calendar-range">
            {fullDate(start)} — {fullDate(end)}
          </p>
          <p className="fine trip-calendar-hint" aria-live="polite">
            {t(
              anchor
                ? 'calendar.chooseTheLastDayOfTheRange'
                : 'calendar.chooseADayOrTheFirstAnd',
            )}
          </p>
          <div className="trip-calendar-weekdays" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>
                {new Date(2026, 0, 5 + i).toLocaleDateString(locale, {
                  weekday: 'short',
                })}
              </span>
            ))}
          </div>
          <div
            className="trip-calendar-days"
            role="group"
            aria-label={t('calendar.tripDates')}
          >
            {Array.from({ length: offset }, (_, i) => (
              <span key={'blank' + i} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const day = month + '-' + String(i + 1).padStart(2, '0');
              const allowed = day >= start && day <= end;
              return (
                <button
                  key={day}
                  type="button"
                  data-date={day}
                  data-selected={!!value && includesDate(day, value)}
                  className={allowed ? 'in-trip' : ''}
                  disabled={!allowed}
                  aria-label={fullDate(day)}
                  aria-pressed={!!value && includesDate(day, value)}
                  onClick={() => {
                    if (!anchor) {
                      setAnchor(day);
                      onChange(day);
                    } else {
                      const [from, to] = [anchor, day].sort();
                      onChange(from === to ? from : from + '..' + to);
                      setAnchor(null);
                      close();
                    }
                  }}
                  onKeyDown={(event) => {
                    const step = (
                      {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      } as Record<string, number>
                    )[event.key];
                    if (!step) return;
                    event.preventDefault();
                    const next = parse(day);
                    next.setDate(next.getDate() + step);
                    const key = iso(next);
                    if (key < start || key > end) return;
                    if (key.slice(0, 7) !== month) setMonth(key.slice(0, 7));
                    requestAnimationFrame(() =>
                      root.current
                        ?.querySelector<HTMLButtonElement>(
                          '[data-date="' + key + '"]',
                        )
                        ?.focus(),
                    );
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="text-button calendar-all-days"
            onClick={() => {
              setAnchor(null);
              onChange('');
              close();
            }}
          >
            {t('calendar.allDays')}
          </button>
        </div>
      )}
    </div>
  );
}
