'use client';

import { useEffect, useRef, useState } from 'react';
import type { TripCover as Cover } from '../lib/contracts';
import { Icon } from './archive/shared';
import RotatedFrame from './rotated-frame';
import { previewBlob } from '../lib/preview-cache';
import { queuePreview } from '../lib/preview-queue';

type LoadedCover = Cover & { url: string };

export default function TripCover({
  covers = [],
  destination,
  index = 0,
  scope,
}: {
  covers?: Cover[];
  destination: string;
  index?: number;
  scope: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<LoadedCover | null>(null);
  const [previous, setPrevious] = useState<LoadedCover | null>(null);
  useEffect(
    () => () => {
      if (previous) URL.revokeObjectURL(previous.url);
    },
    [previous],
  );
  const signature = JSON.stringify(covers);
  useEffect(() => {
    const photos: Cover[] = JSON.parse(signature);
    let disposed = false;
    let visible = false;
    let next = Math.floor(Math.random() * photos.length);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: ReturnType<typeof queuePreview> | null = null;
    const urls = new Set<string>();
    const failed = new Set<string>();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let current: LoadedCover | null = null;
    setActive(null);
    setPrevious(null);
    function schedule() {
      clearTimeout(timer);
      if (
        visible &&
        !document.hidden &&
        !reduced.matches &&
        photos.length - failed.size > 1
      )
        timer = setTimeout(load, 8000);
    }
    function load() {
      if (disposed || !visible || document.hidden || !photos.length || request)
        return;
      let attempts = 0;
      while (
        attempts++ < photos.length &&
        (failed.has(photos[next].id) || photos[next].id === current?.id)
      )
        next = (next + 1) % photos.length;
      const photo = photos[next];
      if (failed.has(photo.id) || photo.id === current?.id) return;
      next = (next + 1) % photos.length;
      const work = queuePreview(scope + ':' + photo.src, 1, (signal) =>
        previewBlob(photo.src, scope, signal),
      );
      request = work;
      void work.promise
        .then(async (blob) => {
          if (disposed) return;
          const url = URL.createObjectURL(blob);
          urls.add(url);
          const image = new Image();
          image.src = url;
          try {
            await image.decode();
          } catch {
            URL.revokeObjectURL(url);
            throw Error('Invalid cover preview');
          }
          if (disposed) {
            URL.revokeObjectURL(url);
            return;
          }
          setPrevious(current);
          current = { ...photo, url };
          setActive(current);
        })
        .catch((error) => {
          if (!disposed && error?.name !== 'AbortError') failed.add(photo.id);
        })
        .finally(() => {
          work.release();
          if (request === work) request = null;
          if (disposed) return;
          if (!current && failed.size < photos.length) load();
          else schedule();
        });
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!current) load();
        else schedule();
      },
      { rootMargin: '100px' },
    );
    if (ref.current) observer.observe(ref.current);
    const visibility = () => {
      if (!current) load();
      else schedule();
    };
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', visibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', visibility);
      request?.release();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [signature, scope]);
  return (
    <div
      ref={ref}
      className={'trip-art art-' + (index % 4) + (active ? ' has-cover' : '')}
    >
      {previous && (
        <div className="trip-cover-photo" aria-hidden="true">
          <RotatedFrame rotation={previous.rotation}>
            <img src={previous.url} alt="" />
          </RotatedFrame>
        </div>
      )}
      {active && (
        <div
          key={active.id}
          className="trip-cover-photo trip-cover-current"
          aria-hidden="true"
        >
          <RotatedFrame rotation={active.rotation}>
            <img src={active.url} alt="" />
          </RotatedFrame>
        </div>
      )}
      <span className="trip-number">
        {String(index + 1).padStart(2, '0')} / ARCHIVE
      </span>
      <Icon name="compass" size={80} />
      <span className="destination-art">{destination}</span>
    </div>
  );
}
