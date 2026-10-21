'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocale } from './appearance';
import MediaPreview from './media-preview';
import { PreviewPriority } from './preview-priority';
export default function MapThumbnail({
  point,
  src,
  scope,
  root,
  onSelect,
  onHighlight,
}: {
  point: {
    id: string;
    name: string;
    title?: string;
    taken: string;
    capture_time?: string | null;
    author?: string;
    kind?: string;
  };
  src?: string;
  scope: string;
  root: RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onHighlight: (id: string | null) => void;
}) {
  const { t, language } = useLocale();
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false),
    [seen, setSeen] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        if (entry.isIntersecting) setSeen(true);
      },
      { root: root.current, rootMargin: '0px 180px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [root]);
  const title = point.title || point.name;
  return (
    <button
      ref={ref}
      type="button"
      className="map-photo-thumb"
      title={title}
      aria-label={
        t(point.kind === 'video' ? 'Открыть видео' : 'Открыть фото') +
        ': ' +
        title
      }
      onClick={() => onSelect(point.id)}
      onMouseEnter={() => onHighlight(point.id)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(point.id)}
      onBlur={() => onHighlight(null)}
    >
      <PreviewPriority.Provider value={near ? 0 : null}>
        {src && seen && (
          <MediaPreview src={src} scope={scope} kind={point.kind || 'photo'} />
        )}
      </PreviewPriority.Provider>
      <span className="map-thumb-caption">
        {new Date(point.taken.slice(0, 10) + 'T12:00:00').toLocaleDateString(
          language === 'en' ? 'en-GB' : 'ru-RU',
          { day: 'numeric', month: 'short' },
        )}
        {point.capture_time ? ', ' + point.capture_time : ''}
        {point.author ? ' · ' + point.author : ''}
      </span>
    </button>
  );
}
