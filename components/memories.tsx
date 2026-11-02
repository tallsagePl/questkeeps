'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { useLocale } from './appearance';
import MediaPreview from './media-preview';

type Memory = {
  id: string;
  taken: string;
  title: string;
  tripTitle: string;
  url: string;
  preview: string;
};

export default function Memories({ userId }: { userId: string }) {
  const { t } = useLocale();
  const [items, setItems] = useState<Memory[]>([]);
  useEffect(() => {
    const stop = new AbortController();
    const now = new Date();
    const date =
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0');
    void api<{ memories: Memory[] }>(
      'memories?date=' + date,
      'GET',
      undefined,
      AbortSignal.any([stop.signal, AbortSignal.timeout(10000)]),
    )
      .then((result) => {
        if (!stop.signal.aborted) setItems(result.memories || []);
      })
      .catch(() => {});
    return () => stop.abort();
  }, [userId]);
  if (!items.length) return null;
  return (
    <section
      className="anniversary-memories"
      aria-label={t('memories.onThisDay')}
    >
      <h2>{t('memories.onThisDay')}</h2>
      <div className="anniversary-items">
        {items.map((item) => (
          <a
            href={item.url}
            key={item.id}
            aria-label={item.tripTitle + ' · ' + item.taken}
          >
            <MediaPreview
              src={item.preview}
              scope={'user:' + userId}
              kind="photo"
            />
            <span>
              {item.tripTitle}
              <small>{item.taken.slice(0, 4)}</small>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
