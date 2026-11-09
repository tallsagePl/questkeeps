'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { analyticsEvent, analyticsGoals } from '@/lib/analytics';

const origin = 'https://questkeeps.ru';

function pageGroup(path: string, trip: boolean) {
  if (path === '/') return trip ? '/analytics/trip' : '/';
  if (['/about', '/guide', '/privacy', '/profile'].includes(path)) return path;
  if (path.startsWith('/s/')) return '/analytics/guest';
  if (path.startsWith('/join/') || path.startsWith('/friend/'))
    return '/analytics/invitation';
  if (
    path.startsWith('/auth/') ||
    ['/verify-email', '/reset-password'].includes(path)
  )
    return '/analytics/account';
  return '/analytics/other';
}

function externalReferrer() {
  try {
    const url = new URL(document.referrer);
    return url.origin !== origin && ['http:', 'https:'].includes(url.protocol)
      ? url.origin
      : '';
  } catch {
    return '';
  }
}

type Message = { type: 'hit' | 'goal'; value: string; referrer?: string };

export default function Metrika() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [enabled, setEnabled] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);
  const pending = useRef<Message[]>([]);
  const lastPage = useRef('');
  const page = pageGroup(pathname, search.has('trip'));

  function send(message: Message) {
    // A sandboxed frame has an opaque origin. Only send fixed labels to its window.
    if (loaded.current) frame.current?.contentWindow?.postMessage(message, '*');
    else if (pending.current.length < 64) pending.current.push(message);
  }

  useEffect(() => {
    if (location.origin !== origin) return;
    const handleGoal = (event: Event) => {
      const goal: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof goal === 'string' && analyticsGoals.has(goal))
        send({ type: 'goal', value: goal });
    };
    window.addEventListener(analyticsEvent, handleGoal);
    setEnabled(true);
    return () => window.removeEventListener(analyticsEvent, handleGoal);
  }, []);

  useEffect(() => {
    if (!enabled || lastPage.current === page) return;
    const referrer = lastPage.current
      ? origin + lastPage.current
      : externalReferrer();
    lastPage.current = page;
    send({ type: 'hit', value: origin + page, referrer });
  }, [enabled, page]);

  if (!enabled) return null;
  return (
    <iframe
      hidden
      title="Yandex Metrika"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      src="/analytics-frame.html"
      ref={frame}
      onLoad={() => {
        loaded.current = true;
        for (const message of pending.current.splice(0)) send(message);
      }}
    />
  );
}
