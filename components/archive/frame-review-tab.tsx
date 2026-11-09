'use client';

import { trackGoal } from '@/lib/analytics';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/appearance';
import { reviewGroups, type FrameSignature } from '../../lib/frame-review';
import MediaPreview from '../media-preview';
import {
  frameReviewSourceFingerprint,
  getFrameReviewGroups,
  getFrameReviewSignature,
  putFrameReviewGroups,
  putFrameReviewSignature,
} from '../../lib/frame-review-cache';
import type { CachedGroups } from '../../lib/frame-review-cache';
import { readPhoto, readVideo } from './frame-review-media';
import type { ArchiveController } from './use-archive';

type Scan = {
  kind: 'photo' | 'video';
  done: number;
  total: number;
  skipped: number;
  groups: FrameSignature[][];
  running: boolean;
};

export default function FrameReviewTab({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const [scans, setScans] = useState<Partial<Record<Scan['kind'], Scan>>>({});
  const [activeKind, setActiveKind] = useState<Scan['kind']>('photo');
  const scan = scans[activeKind] ?? null;
  const controller = useRef<AbortController | null>(null);
  const restoredScope = useRef('');
  useEffect(() => () => controller.current?.abort(), []);

  const media = (archive.data?.media ?? []).filter(
    (item) => !item.hidden && !item.missing,
  );
  const byId = new Map(media.map((item) => [item.id, item]));
  const preview = (item: (typeof media)[number]) =>
    archive.mediaPath(item, 'preview') +
    '?revision=' +
    encodeURIComponent(item.revision || '1');

  useEffect(() => {
    const userId = archive.user?.id;
    const tripId = archive.trip?.id;
    if (!userId || !tripId || !archive.data) return;
    const scope = userId + ':' + tripId;
    let cancelled = false;
    const currentMedia = new Map(
      archive.data.media
        .filter((item) => !item.hidden && !item.missing)
        .map((item) => [item.id, item]),
    );
    const sourceItems = [...currentMedia.values()];
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const restore = async (attempt = 0) => {
      let fingerprint: string;
      try {
        fingerprint = await frameReviewSourceFingerprint(sourceItems);
      } catch {
        if (!cancelled && attempt < 8)
          retryTimer = setTimeout(() => void restore(attempt + 1), 400);
        return;
      }
      if (cancelled) return;
      const restoreKey = scope + ':' + fingerprint;
      if (restoredScope.current === restoreKey) return;
      if (controller.current) {
        if (attempt < 8)
          retryTimer = setTimeout(() => void restore(attempt + 1), 400);
        return;
      }
      if (restoredScope.current) setScans({});
      const savedResults = await Promise.all([
        getFrameReviewGroups(userId, tripId, 'photo', fingerprint),
        getFrameReviewGroups(userId, tripId, 'video', fingerprint),
      ]);
      if (cancelled) return;
      if (controller.current || savedResults.includes(null)) {
        if (attempt < 8)
          retryTimer = setTimeout(() => void restore(attempt + 1), 400);
        return;
      }
      restoredScope.current = restoreKey;
      const available = savedResults.filter(
        (result): result is CachedGroups =>
          result !== undefined && result !== null,
      );
      const restored = new Map<Scan['kind'], Scan>();
      for (const saved of available) {
        const groups = saved.groups
          .map((group) =>
            group.flatMap(({ id, pixels, revision }) => {
              const item = currentMedia.get(id);
              if (!item || (item.revision || '1') !== revision) return [];
              return [
                {
                  id,
                  pixels,
                  favorite: !!item.favorite,
                  frames: [],
                },
              ];
            }),
          )
          .filter((group) => group.length > 1)
          .map((group) =>
            group.sort(
              (first, second) =>
                Number(second.favorite) - Number(first.favorite) ||
                second.pixels - first.pixels,
            ),
          );
        restored.set(saved.kind, {
          kind: saved.kind,
          done: saved.total,
          total: saved.total,
          skipped: saved.skipped,
          groups,
          running: false,
        });
      }
      setScans(
        Object.fromEntries(restored) as Partial<Record<Scan['kind'], Scan>>,
      );
      const latest = available.sort(
        (first, second) => second.savedAt - first.savedAt,
      )[0];
      if (latest) setActiveKind(latest.kind);
    };

    void restore();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [archive.data, archive.trip?.id, archive.user?.id]);

  async function start(kind: Scan['kind']) {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setActiveKind(kind);
    const items = media.filter((item) => item.kind === kind);
    const result: Scan = {
      kind,
      done: 0,
      total: items.length,
      skipped: 0,
      groups: [],
      running: true,
    };
    const signatures: FrameSignature[] = [];
    setScans((current) => ({ ...current, [kind]: { ...result } }));
    let sourceFingerprint: string | undefined;
    try {
      sourceFingerprint = await frameReviewSourceFingerprint(media);
    } catch {
      // Keep the scan usable when Web Crypto is unavailable; skip manifest persistence.
    }
    for (const item of items) {
      if (active.signal.aborted) break;
      try {
        const signal = AbortSignal.any([
          active.signal,
          AbortSignal.timeout(12000),
        ]);
        const userId = archive.user?.id;
        const revision = item.revision || '1';
        let features = userId
          ? await getFrameReviewSignature(
              userId,
              archive.trip!.id,
              kind,
              item.id,
              revision,
            )
          : undefined;
        if (!features) {
          features =
            kind === 'photo'
              ? await readPhoto(preview(item), signal)
              : await readVideo(
                  archive.mediaPath(item, 'original'),
                  signal,
                ).catch(() =>
                  readVideo(archive.mediaPath(item, 'playback'), signal),
                );
          if (active.signal.aborted) break;
          if (userId)
            await putFrameReviewSignature(
              userId,
              archive.trip!.id,
              kind,
              revision,
              { id: item.id, ...features },
            );
        }
        if (active.signal.aborted) break;
        signatures.push({
          id: item.id,
          favorite: !!item.favorite,
          ...features,
        });
      } catch {
        if (active.signal.aborted) break;
        result.skipped++;
      }
      result.done++;
      setScans((current) => ({ ...current, [kind]: { ...result } }));
    }
    if (controller.current !== active) return;
    controller.current = null;
    if (!active.signal.aborted) {
      const groups = reviewGroups(signatures);
      if (archive.user?.id && sourceFingerprint)
        await putFrameReviewGroups(
          archive.user.id,
          archive.trip!.id,
          kind,
          sourceFingerprint,
          groups.map((group) =>
            group.map(({ id, pixels }) => ({
              id,
              pixels,
              revision: media.find((item) => item.id === id)?.revision || '1',
            })),
          ),
          result.skipped,
          result.total,
        );
      setScans((current) => ({
        ...current,
        [kind]: { ...result, groups, running: false },
      }));
    }
  }

  const groups =
    scan?.groups
      .map((group) => group.filter(({ id }) => byId.has(id)))
      .filter((group) => group.length > 1) ?? [];
  const scanRunning = Object.values(scans).some((result) => result?.running);
  const activateOrStart = (kind: Scan['kind']) => {
    if (scanRunning) return;
    const previous = scans[kind];
    if (previous && !previous.running) {
      setActiveKind(kind);
      return;
    }
    void start(kind);
  };

  return (
    <section className="frame-review" aria-labelledby="frame-review-title">
      <h2 id="frame-review-title">{t('frameReview.title')}</h2>
      <p className="muted">{t('frameReview.intro')}</p>
      <div className="frame-review-actions">
        <button
          type="button"
          className="secondary"
          disabled={scanRunning}
          onClick={() => {
            trackGoal('trip_photo_review_clicked');
            activateOrStart('photo');
          }}
        >
          {t('frameReview.photos')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={scanRunning}
          onClick={() => {
            trackGoal('trip_video_review_clicked');
            activateOrStart('video');
          }}
        >
          {t('frameReview.videos')}
        </button>
        {scan?.running && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              controller.current?.abort();
              controller.current = null;
              setScans((current) => ({ ...current, [activeKind]: undefined }));
            }}
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
      {scan && (
        <p role="status" className="fine">
          {t('frameReview.progress', {
            done: scan.done,
            total: scan.total,
            skipped: scan.skipped,
          })}
          {!scan.running && (groups.length ? '' : ' ' + t('frameReview.empty'))}
        </p>
      )}
      {groups.map((group, index) => (
        <section key={group[0].id} className="frame-review-group">
          <h3>
            {t(
              scan?.kind === 'video'
                ? 'frameReview.videoGroup'
                : 'frameReview.photoGroup',
              { number: index + 1 },
            )}
          </h3>
          <ul className="frame-review-grid">
            {group.map(({ id, favorite, pixels }, position) => {
              const item = byId.get(id)!;
              const reason = favorite
                ? 'frameReview.favorite'
                : group.slice(1).every((other) => pixels > other.pixels)
                  ? 'frameReview.resolution'
                  : 'frameReview.compare';
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="frame-review-item"
                    onClick={() => archive.openMedia(item)}
                  >
                    <div className="frame-review-preview">
                      <MediaPreview
                        src={preview(item)}
                        scope={'user:' + archive.user?.id}
                        kind={item.kind}
                        rotation={item.rotation}
                      />
                    </div>
                    <strong>{item.title || item.name}</strong>
                    <span className="fine">
                      {position === 0 ? t(reason) : t('frameReview.open')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
