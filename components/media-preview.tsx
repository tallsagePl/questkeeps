'use client';
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocale } from './appearance';
import { previewBlob, discardPreview } from '../lib/preview-cache';
import { queuePreview } from '../lib/preview-queue';
import { PreviewPriority } from './preview-priority';
import { CACHE_TTL } from '../lib/memory-cache';
import { retryPlaceWhenIdle } from '../lib/place-resource-queue';
export default function MediaPreview({
  src,
  kind,
  scope,
}: {
  src: string;
  kind: string;
  scope: string;
}) {
  return (
    <RetryingPreview key={scope + src} src={src} kind={kind} scope={scope} />
  );
}
function RetryingPreview({
  src,
  kind,
  scope,
}: {
  src: string;
  kind: string;
  scope: string;
}) {
  const { t } = useLocale();
  const priority = useContext(PreviewPriority);
  const eligible = priority !== null;
  const request = useRef<ReturnType<typeof queuePreview> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    'loading' | 'retrying' | 'loaded' | 'failed'
  >('loading');
  useEffect(() => {
    if (state !== 'retrying' || !eligible) return;
    const timer = setTimeout(
      () => {
        setAttempt((n) => n + 1);
        setState('loading');
      },
      [600, 1600, 3500][attempt] + Math.random() * 200,
    );
    return () => clearTimeout(timer);
  }, [state, attempt, eligible]);
  useEffect(() => {
    const online = () => {
      if (state === 'failed') {
        setAttempt(0);
        setState('loading');
      }
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [state]);
  useEffect(() => {
    if (!eligible || state !== 'failed' || attempt >= 5) return;
    return retryPlaceWhenIdle(
      () => {
        setAttempt((n) => n + 1);
        setState('loading');
      },
      attempt < 4 ? 10000 : 30000,
    );
  }, [eligible, state, attempt]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!eligible || url || state !== 'loading') return;
    let disposed = false;
    const work = queuePreview(scope + ':' + src, priority ?? 1, (signal) =>
      previewBlob(src, scope, signal),
    );
    request.current = work;
    work.promise
      .then((blob) => {
        if (!disposed) setUrl(URL.createObjectURL(blob));
      })
      .catch((error) => {
        if (!disposed && error?.name !== 'AbortError')
          setState(attempt < 3 ? 'retrying' : 'failed');
      });
    return () => {
      disposed = true;
      work.release();
      if (request.current === work) request.current = null;
    };
  }, [src, scope, attempt, eligible, url, state]);
  useEffect(() => {
    if (priority !== null) request.current?.setPriority(priority);
  }, [priority]);
  useEffect(() => {
    if (eligible || !url) return;
    const timer = setTimeout(() => {
      setUrl(undefined);
      setState('loading');
      setAttempt(0);
    }, CACHE_TTL);
    return () => clearTimeout(timer);
  }, [eligible, url]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <span className="media-preview" data-state={state}>
      <span className="photo-placeholder" aria-hidden="true">
        <svg
          width="38"
          height="38"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path
            d={kind === 'video' ? 'm10 8 6 4-6 4V8Z' : 'm3 16 5-5 4 4 3-3 6 6'}
          />
        </svg>
        {state === 'failed' ? t('Превью недоступно') : t('Загружаем превью…')}
      </span>
      {url && (
        <img
          key={url}
          src={url}
          alt=""
          loading="eager"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => {
            setState(attempt < 3 ? 'retrying' : 'failed');
            // A failed object URL must not block the next network attempt.
            void discardPreview(src, scope).finally(() => setUrl(undefined));
          }}
        />
      )}
    </span>
  );
}
