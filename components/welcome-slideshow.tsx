'use client';
import { useEffect, useState, useRef } from 'react';
import { useLocale } from './appearance';
const photos = [
  {
    id: 'great-wall',
    alt: 'Великая Китайская стена среди гор',
    position: '50% 55%',
  },
  { id: 'pyramids', alt: 'Пирамиды Гизы на закате', position: '50% 48%' },
  {
    id: 'santorini',
    alt: 'Белые дома Санторини над Эгейским морем',
    position: '50% 55%',
  },
  {
    id: 'machu-picchu',
    alt: 'Мачу-Пикчу среди зелёных гор Перу',
    position: '50% 48%',
  },
];
export default function WelcomeSlideshow() {
  const { t } = useLocale();
  const container = useRef<HTMLElement>(null),
    failed = useRef(new Set<number>());
  useEffect(() => {
    const images = Array.from(container.current?.querySelectorAll('img') || []);
    const available = images.flatMap((image, index) =>
      image.complete && image.naturalWidth > 0 ? [index] : [],
    );
    images.forEach((image, index) => {
      if (image.complete && !image.naturalWidth) failed.current.add(index);
    });
    if (available.length) {
      setLoaded(available);
      if (failed.current.has(0)) setActive(available[0]);
    }
  }, []);
  const [active, setActive] = useState(0),
    [loaded, setLoaded] = useState<number[]>([]),
    [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(false),
    [hovered, setHovered] = useState(false),
    [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => setReduced(media.matches),
      visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || hovered || !visible || loaded.length < 2) return;
    const timer = setInterval(
      () =>
        setActive((current) => {
          for (let offset = 1; offset <= photos.length; offset++) {
            const next = (current + offset) % photos.length;
            if (loaded.includes(next)) return next;
          }
          return current;
        }),
      7000,
    );
    return () => clearInterval(timer);
  }, [paused, reduced, hovered, visible, loaded]);
  return (
    <section
      ref={container}
      className="landscape welcome-slideshow"
      aria-label={t('Места, куда хочется отправиться')}
      aria-roledescription={t('Слайд-шоу')}
      aria-live="off"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setHovered(false);
      }}
    >
      {photos.map((photo, index) => (
        <img
          key={photo.id}
          className={'welcome-slide' + (active === index ? ' is-active' : '')}
          src={'/welcome/' + photo.id + '.webp'}
          alt={t(photo.alt)}
          aria-hidden={active !== index}
          width="1280"
          height="580"
          style={{ objectPosition: photo.position }}
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : 'low'}
          decoding="async"
          onLoad={() => {
            if (failed.current.has(active)) setActive(index);
            setLoaded((previous) =>
              previous.includes(index) ? previous : [...previous, index],
            );
          }}
          onError={() => {
            failed.current.add(index);
            setLoaded((previous) =>
              previous.filter((value) => value !== index),
            );
            setActive((current) =>
              current === index
                ? (loaded.find((value) => value !== index) ?? current)
                : current,
            );
          }}
        />
      ))}
      <div className="landscape-label">
        {t('СОХРАНЯЙТЕ МЕСТА. ВОЗВРАЩАЙТЕСЬ К ЧУВСТВАМ.')}
      </div>
      {!reduced && (
        <button
          type="button"
          className="slideshow-toggle"
          aria-label={t(
            paused
              ? 'Продолжить смену фотографий'
              : 'Приостановить смену фотографий',
          )}
          title={t(
            paused
              ? 'Продолжить смену фотографий'
              : 'Приостановить смену фотографий',
          )}
          onClick={() => setPaused((value) => !value)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            {paused ? (
              <path d="m8 5 11 7-11 7Z" />
            ) : (
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            )}
          </svg>
        </button>
      )}
    </section>
  );
}
