'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../appearance';
import { api } from '../api';
import Modal from '../modal';
import MediaPreview from '../media-preview';
import {
  createShareCards,
  shareablePhotos,
  type ShareCard,
  type ShareFormat,
} from '../../lib/share-cards';
import type { ArchiveController } from './use-archive';

export default function PublishDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t, m, language } = useLocale();
  const trip = archive.trip!;
  const photos = shareablePhotos(archive.data?.media || []);
  const [format, setFormat] = useState<ShareFormat>('post');
  const [platform, setPlatform] = useState<'instagram' | 'telegram'>(
    'instagram',
  );
  const [amount, setAmount] = useState(1);
  const [selected, setSelected] = useState(
    photos.slice(0, 3).map((photo) => photo.id),
  );
  const [limit, setLimit] = useState(24);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headline, setHeadline] = useState(trip.title);
  const [caption, setCaption] = useState(
    t('exports.caption', { title: trip.title }),
  );
  const [includeLink, setIncludeLink] = useState(
    !!archive.share || (archive.isOwner && !!trip.sharing),
  );
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [cards, setCards] = useState<ShareCard[]>([]);
  const [active, setActive] = useState(0);
  const [link, setLink] = useState('https://questkeeps.ru/');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [canShare, setCanShare] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(
    () => () => cards.forEach((card) => URL.revokeObjectURL(card.url)),
    [cards],
  );
  const invalidate = () => {
    setCards([]);
    setActive(0);
    setNotice('');
    setError('');
  };
  const changeFormat = (next: ShareFormat) => {
    invalidate();
    setFormat(next);
    if (next === 'stories')
      setSelected(photos.slice(0, amount).map((photo) => photo.id));
  };
  const changeAmount = (next: number) => {
    invalidate();
    setAmount(next);
    setSelected(
      [
        ...selected,
        ...photos
          .map((photo) => photo.id)
          .filter((id) => !selected.includes(id)),
      ].slice(0, next),
    );
  };
  async function generate() {
    setBusy(true);
    setError('');
    setNotice('');
    setProgress('');
    setCards([]);
    const run = new AbortController();
    controller.current?.abort();
    controller.current = run;
    try {
      const chosen = selected
        .map((id) => photos.find((photo) => photo.id === id))
        .filter((photo) => !!photo);
      if (!chosen.length || (format === 'stories' && chosen.length !== amount))
        throw Error('exports.choosePhotos');
      let destination = 'https://questkeeps.ru/';
      if (includeLink && archive.share)
        destination = location.origin + '/s/' + archive.share;
      else if (includeLink && archive.isOwner) {
        const existing = trip.sharing
          ? await api(
              'trips/' + trip.id + '/share',
              'GET',
              undefined,
              run.signal,
            )
          : null;
        const result = existing?.url
          ? existing
          : await api(
              'trips/' + trip.id + '/share',
              'POST',
              { enabled: true },
              run.signal,
            );
        destination = result.url;
        archive.setData((old) =>
          old ? { ...old, trip: { ...old.trip, sharing: true } } : old,
        );
      }
      run.signal.throwIfAborted();

      const date = (value: string) =>
        new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString(
          language === 'ru' ? 'ru-RU' : 'en-GB',
          { day: 'numeric', month: 'short', year: 'numeric' },
        );
      const result = await createShareCards({
        format,
        photos: chosen.map((photo) => ({
          src: archive.mediaPath(photo, 'preview'),
          rotation: photo.rotation,
          title: photo.title || t('exports.moments'),
        })),
        headline: headline.trim() || trip.title,
        destination: trip.destination,
        dates: date(trip.start) + ' — ' + date(trip.end),
        footer: t('exports.footer'),
        action: t('exports.cardAction'),
        collection: t('exports.collection'),
        fit,
        signal: run.signal,
        onProgress: (current, total) =>
          setProgress(t('exports.progress', { current, total })),
      });
      if (run.signal.aborted) {
        result.forEach((card) => URL.revokeObjectURL(card.url));
        return;
      }
      setLink(destination);
      setCards(result);
      setActive(0);
      try {
        setCanShare(
          !!navigator.canShare?.({ files: result.map((card) => card.file) }),
        );
      } catch {
        setCanShare(false);
      }
    } catch (e) {
      if (!run.signal.aborted) setError((e as Error).message);
    } finally {
      if (!run.signal.aborted) setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('exports.copied');
      setError('');
    } catch {
      setError('exports.copyFailed');
    }
  }
  const text = caption.trim() + '\n\n' + link;
  return (
    <Modal title={t('exports.title')} wide onClose={() => archive.setModal('')}>
      <div className="publish-editor">
        <div className="publish-settings">
          <p className="muted">{t('exports.intro')}</p>
          <fieldset disabled={busy} className="publish-options">
            <div
              className="publish-choice"
              role="group"
              aria-label={t('exports.platform')}
            >
              {(['instagram', 'telegram'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={platform === value ? 'primary' : 'secondary'}
                  aria-pressed={platform === value}
                  onClick={() => setPlatform(value)}
                >
                  {value === 'instagram' ? 'Instagram' : 'Telegram'}
                </button>
              ))}
            </div>
            <label className="field">
              <span>{t('exports.format')}</span>
              <select
                value={format}
                onChange={(event) =>
                  changeFormat(event.target.value as ShareFormat)
                }
              >
                <option value="post">{t('exports.post')}</option>
                <option value="stories">{t('exports.stories')}</option>
              </select>
            </label>
            {format === 'stories' && (
              <label className="field">
                <span>{t('exports.amount')}</span>
                <select
                  value={amount}
                  onChange={(event) => changeAmount(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={value > photos.length}
                    >
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>{t('exports.headline')}</span>
              <input
                maxLength={120}
                value={headline}
                onChange={(event) => {
                  setHeadline(event.target.value);
                  invalidate();
                }}
              />
            </label>
            <label className="field">
              <span>{t('exports.fit')}</span>
              <select
                value={fit}
                onChange={(event) => {
                  setFit(event.target.value as 'contain' | 'cover');
                  invalidate();
                }}
              >
                <option value="contain">{t('exports.contain')}</option>
                <option value="cover">{t('exports.cover')}</option>
              </select>
            </label>
            <details
              className="publish-photo-picker"
              onToggle={(event) => setPickerOpen(event.currentTarget.open)}
            >
              <summary>
                {t('exports.photos', { count: selected.length })}
              </summary>
              <p className="fine">{t('exports.publicPhotosOnly')}</p>
              <div className="publish-photo-grid">
                {pickerOpen &&
                  photos.slice(0, limit).map((photo) => (
                    <label key={photo.id} className="publish-photo-option">
                      <input
                        type="checkbox"
                        checked={selected.includes(photo.id)}
                        aria-label={photo.title || photo.name}
                        onChange={(event) => {
                          invalidate();
                          setSelected((old) =>
                            event.target.checked
                              ? [...old, photo.id]
                              : old.filter((id) => id !== photo.id),
                          );
                        }}
                        disabled={
                          !selected.includes(photo.id) &&
                          selected.length >= (format === 'stories' ? amount : 5)
                        }
                      />
                      <span className="publish-photo-thumb">
                        <MediaPreview
                          src={archive.mediaPath(photo, 'preview')}
                          scope={archive.resourceScope}
                          kind="photo"
                          rotation={photo.rotation}
                        />
                      </span>
                      <span>{photo.title || photo.name}</span>
                    </label>
                  ))}
              </div>
              {photos.length > limit && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setLimit((value) => value + 24)}
                >
                  {t('exports.morePhotos')}
                </button>
              )}
            </details>
            {(archive.isOwner || archive.share) && (
              <label className="publish-link-option">
                <input
                  type="checkbox"
                  checked={includeLink}
                  onChange={(event) => {
                    setIncludeLink(event.target.checked);
                    invalidate();
                  }}
                />
                <span>{t('exports.includeTripLink')}</span>
              </label>
            )}
            {includeLink && archive.isOwner && !trip.sharing && (
              <p className="fine">{t('exports.enableGuestNotice')}</p>
            )}
            <button
              type="button"
              className="primary"
              disabled={
                !photos.length ||
                !selected.length ||
                (format === 'stories' && selected.length !== amount)
              }
              onClick={() => void generate()}
            >
              {busy ? t('exports.creating') : t('exports.create')}
            </button>
          </fieldset>
          {busy && <p role="status">{progress || t('exports.creating')}</p>}
          {!photos.length && <p>{t('exports.empty')}</p>}
          {error && (
            <p className="inline-error" role="alert">
              {m(error)}
            </p>
          )}
          {notice && <p role="status">{t('exports.copied')}</p>}
        </div>
        <div className="publish-preview">
          {cards.length ? (
            <>
              <img
                className="publish-result"
                src={cards[active].url}
                alt={t('exports.preview', { number: active + 1 })}
              />
              {cards.length > 1 && (
                <div
                  className="publish-pages"
                  role="group"
                  aria-label={t('exports.pages')}
                >
                  {cards.map((_, index) => (
                    <button
                      type="button"
                      className={active === index ? 'primary' : 'secondary'}
                      key={index}
                      aria-pressed={active === index}
                      onClick={() => setActive(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              )}
              <div className="publish-downloads">
                {cards.map((card, index) => (
                  <a
                    key={card.url}
                    className="secondary"
                    href={card.url}
                    download={card.file.name}
                  >
                    {t('exports.download', { number: index + 1 })}
                  </a>
                ))}
              </div>
              <label className="field">
                <span>{t('exports.captionLabel')}</span>
                <textarea
                  rows={3}
                  maxLength={1500}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t('exports.link')}</span>
                <input
                  readOnly
                  value={link}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <div className="publish-choice">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copy(text)}
                >
                  {t('exports.copyCaption')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void copy(link)}
                >
                  {t('common.copyLink')}
                </button>
              </div>
              <p className="fine">
                {t(
                  platform === 'instagram'
                    ? 'exports.instagramHint'
                    : format === 'stories'
                      ? 'exports.telegramStoriesHint'
                      : 'exports.telegramHint',
                )}
              </p>
              <button
                type="button"
                className="primary"
                disabled={sharing || !canShare}
                onClick={async () => {
                  setSharing(true);
                  setError('');
                  try {
                    await navigator.share({
                      files: cards.map((card) => card.file),
                      title: headline,
                      text,
                    });
                  } catch (e) {
                    if ((e as Error).name !== 'AbortError')
                      setError('exports.shareFailed');
                  } finally {
                    setSharing(false);
                  }
                }}
              >
                {t('exports.shareFiles')}
              </button>
              {!canShare && (
                <p className="fine">{t('exports.downloadInstead')}</p>
              )}
              {platform === 'telegram' && (
                <a
                  className="secondary centered"
                  href={
                    'https://t.me/share/url?url=' +
                    encodeURIComponent(link) +
                    '&text=' +
                    encodeURIComponent(caption.trim())
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('exports.telegramLink')}
                </a>
              )}
            </>
          ) : (
            <div className="publish-preview-empty">
              <p>{t('exports.previewEmpty')}</p>
              <span className="fine">
                {format === 'stories' ? '1080 × 1920' : '1080 × 1350'}
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
