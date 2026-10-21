'use client';
import {
  useContext,
  useEffect,
  useRef,
  useState,
  cloneElement,
  type ReactElement,
  type Ref,
} from 'react';
import { useLocale } from './appearance';
import { PreviewPriority } from './preview-priority';
import {
  cachedPlaceDescription,
  type PlaceText,
} from '../lib/place-client-cache';
import { queuePlaceDescription } from '../lib/place-description-queue';
import { retryPlaceWhenIdle } from '../lib/place-resource-queue';
export default function LocalizedArticle({
  place,
  endpoint,
  scope,
  children,
}: {
  place: any;
  endpoint: string;
  scope: string;
  children: (place: any) => ReactElement;
}) {
  const { language, t } = useLocale(),
    priority = useContext(PreviewPriority);
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false),
    [attempt, setAttempt] = useState(0),
    [failed, setFailed] = useState(false);
  const key = language + ':' + scope + ':' + endpoint;
  const [loaded, setLoaded] = useState<{ key: string; data: PlaceText } | null>(
    null,
  );
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: '200px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near || priority === null) return;
    let disposed = false;
    const controller = new AbortController();
    setFailed(false);
    void queuePlaceDescription(
      () => cachedPlaceDescription(endpoint, scope, language),
      controller.signal,
      priority,
    )
      .then((data) => {
        if (!disposed) setLoaded({ key, data });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [key, near, priority, attempt]);
  useEffect(() => {
    if (!near || priority === null || !failed || attempt >= 4) return;
    return retryPlaceWhenIdle(
      () => setAttempt((n) => n + 1),
      [1000, 2500, 10000, 30000][attempt],
    );
  }, [failed, near, priority, attempt]);
  const data = loaded?.key === key ? loaded.data : null;
  const loading = t(
    failed ? 'Описание пока недоступно' : 'Загружаем описание…',
  );
  const originalAllowed = language === 'ru';
  const localized = {
    ...place,
    title: data?.title || (originalAllowed ? place.title : t('Место')),
    summary:
      data?.summary ||
      data?.description ||
      (originalAllowed ? place.summary : loading),
    description: data?.description || (originalAllowed ? undefined : loading),
    sourceUrl: data
      ? data.url === undefined
        ? place.url
        : data.url
      : originalAllowed
        ? place.url
        : null,
    articleFailed: failed,
    articleRetry: () => setAttempt((n) => n + 1),
  };
  return cloneElement(
    children(localized) as ReactElement<{ ref?: Ref<HTMLElement> }>,
    { ref },
  );
}
