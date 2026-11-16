'use client';

import { useEffect, useId, useState } from 'react';
import type { PhotoSelfMarks } from '@/lib/contracts';
import { api } from '../api';
import { useLocale } from '../appearance';
import { Icon } from './shared';
import styles from './photo-people.module.css';

export default function PhotoPeople({ photoId }: { photoId: string }) {
  const { t } = useLocale();
  const headingId = useId();
  const path = 'media/' + encodeURIComponent(photoId) + '/self-mark';
  const [marks, setMarks] = useState<PhotoSelfMarks | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(12000),
    ]);
    void api<PhotoSelfMarks>(path, 'GET', undefined, signal)
      .then((result) => {
        if (!controller.signal.aborted) setMarks(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [path, attempt]);

  async function toggleMark() {
    if (!marks || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      setMarks(
        await api<PhotoSelfMarks>(path, 'PATCH', { marked: !marks.markedByMe }),
      );
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.headingRow}>
        <h3 id={headingId}>{t('photoPeople.heading')}</h3>
        {marks && (
          <button
            type="button"
            className={`secondary ${styles.mark}`}
            aria-pressed={marks.markedByMe}
            aria-disabled={saving}
            onClick={() => void toggleMark()}
          >
            <Icon name={marks.markedByMe ? 'check' : 'plus'} size={17} />
            {t('photoPeople.thisIsMe')}
          </button>
        )}
      </div>
      {!marks && !loadFailed && (
        <p role="status" className="fine">
          {t('common.loading')}
        </p>
      )}
      {loadFailed && (
        <div className={styles.error}>
          <p role="alert" className="inline-error">
            {t('photoPeople.loadFailed')}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setLoadFailed(false);
              setAttempt((previous) => previous + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {saveFailed && (
        <p role="alert" className="inline-error">
          {t('photoPeople.saveFailed')}
        </p>
      )}
      {!!marks?.people.length && (
        <ul className={styles.people}>
          {marks.people.map((person) => (
            <li key={person.id}>
              {person.username ? (
                <a href={'/@' + person.username}>
                  {person.name} <span>@{person.username}</span>
                </a>
              ) : (
                person.name
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
