'use client';

import { useEffect, useState, useRef } from 'react';
import { useLocale } from './appearance';

const photos = [
  {
    id: 'great-wall',
    altKey: 'welcome.theGreatWallOfChinaWindingThrough',
    position: '50% 55%',
  },
  {
    id: 'pyramids',
    altKey: 'welcome.thePyramidsOfGizaAtSunset',
    position: '50% 48%',
  },
  {
    id: 'santorini',
    altKey: 'welcome.whiteHousesInSantoriniAboveTheAegean',
    position: '50% 55%',
  },
  {
    id: 'machu-picchu',
    altKey: 'welcome.machuPicchuInTheGreenMountainsOf',
    position: '50% 48%',
  },
] as const;

export default function WelcomeSlideshow() {
  const { t } = useLocale();
  const container = useRef<HTMLElement>(null);
  const failed = useRef(new Set<number>());
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
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<number[]>([]);
  const [reduced, setReduced] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
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
    if (reduced || hovered || !visible || loaded.length < 2) return;
    const timer = setInterval(() => {
      // The preference can change before React cleans up the current timer.
      if (
        document.hidden ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      setActive((current) => {
        for (let offset = 1; offset <= photos.length; offset++) {
          const next = (current + offset) % photos.length;
          if (loaded.includes(next)) return next;
        }
        return current;
      });
    }, 7000);
    return () => clearInterval(timer);
  }, [reduced, hovered, visible, loaded]);
  return (
    <section
      ref={container}
      className="landscape welcome-slideshow"
      aria-label={t('welcome.placesYouWouldLoveToVisit')}
      aria-roledescription={t('welcome.slideshow')}
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
          alt={t(photo.altKey)}
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
        {t('welcome.saveThePlacesReliveTheFeeling')}
      </div>
    </section>
  );
}
