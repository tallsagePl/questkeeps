'use client';

import { useEffect, useRef, useState } from 'react';
import { I18nProvider } from '@videojs/react/i18n';
import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import './video-viewer.css';
import { useLocale } from './appearance';

type Props = { src: string; onRetry: () => void };

type Preparation = { state: string; stage?: string; message?: string | null };

export default function VideoViewer({ src, onRetry }: Props) {
  return <CompatibleVideo key={src} src={src} onRetry={onRetry} />;
}

function CompatibleVideo({ src, onRetry }: Props) {
  const { t, m } = useLocale();
  const [preparation, setPreparation] = useState<Preparation>({
    state: 'idle',
  });
  const [compatible, setCompatible] = useState(false);
  const [busy, setBusy] = useState(false);
  const preferOriginal = useRef(false);
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = toolbar.current;
    const navigation = element?.closest<HTMLElement>('.place-photo-navigation');
    if (!element || !navigation) return;
    const measure = () =>
      navigation.style.setProperty(
        '--video-toolbar-height',
        element.getBoundingClientRect().height + 'px',
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      navigation.style.removeProperty('--video-toolbar-height');
    };
  }, []);
  const statusURL = src.replace(/\/original(?=\?|$)/, '/playback-status');
  const playbackURL = src.replace(/\/original(?=\?|$)/, '/playback');
  const pending = ['pending', 'processing'].includes(preparation.state);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (document.hidden) {
        timer = setTimeout(check, 3000);
        return;
      }
      try {
        const response = await fetch(statusURL, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5000),
          ]),
        });
        if (response.ok) {
          const value = (await response.json()) as Preparation;
          setPreparation(value);
          if (value.state === 'ready' && !preferOriginal.current)
            setCompatible(true);
        }
      } catch {
        /* Original playback remains available when preparation status is offline. */
      }
      if (!controller.signal.aborted && pending)
        timer = setTimeout(check, 2500);
    };
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [statusURL, pending]);
  const prepare = async () => {
    preferOriginal.current = false;
    setBusy(true);
    try {
      const response = await fetch(playbackURL, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
      const value = await response.json();
      if (!response.ok) throw Error('Preparation unavailable');
      setPreparation(value);
      if (value.state === 'ready' && !preferOriginal.current)
        setCompatible(true);
    } catch {
      setPreparation({ state: 'error', message: 'video.failed' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="compatible-video">
      <div ref={toolbar} className="video-compatibility-controls">
        {compatible ? (
          <>
            <span>{t('video.compatible720')}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                preferOriginal.current = true;
                setCompatible(false);
              }}
            >
              {t('video.original')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="secondary"
            disabled={busy || pending}
            onClick={prepare}
          >
            {t(pending ? 'video.preparing' : 'video.prepare')}
          </button>
        )}
        {pending && (
          <span role="status">
            {t(
              preparation.stage === 'download'
                ? 'video.downloading'
                : 'video.preparing',
            )}
          </span>
        )}
        {preparation.state === 'error' && (
          <span role="status">{m(preparation.message || 'video.failed')}</span>
        )}
      </div>
      <Playback
        key={compatible ? playbackURL : src}
        src={compatible ? playbackURL : src}
        onRetry={onRetry}
        poster={
          compatible ? src.replace(/\/original(?=\?|$)/, '/poster') : undefined
        }
      />
    </div>
  );
}

function Playback({ src, onRetry, poster }: Props & { poster?: string }) {
  const { t, language } = useLocale();
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const error = () => setFailed(!!element.error);
    // Metadata can fail before React's delegated error handler is attached.
    error();
    element.addEventListener('error', error);
    element.addEventListener('loadedmetadata', error);
    return () => {
      element.removeEventListener('error', error);
      element.removeEventListener('loadedmetadata', error);
      if (!element.isConnected) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    };
  }, []);
  return (
    <div
      className="video-viewer"
      onKeyDown={(event) => {
        // The surrounding gallery uses arrows to change photos. Inside a video,
        // they belong to the player's seek and volume controls.
        if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(
            event.key,
          )
        )
          event.stopPropagation();
      }}
    >
      <I18nProvider locale={language}>
        <VideoPlayer poster={poster}>
          <VideoSkin className="questkeeps-video-player">
            <Video
              ref={video}
              playsInline
              preload="auto"
              src={src}
              onError={() => setFailed(true)}
              onLoadedMetadata={() => setFailed(false)}
            />
          </VideoSkin>
        </VideoPlayer>
      </I18nProvider>
      {failed && (
        <p role="status" className="video-playback-error">
          <span>{t('media.videoPlaybackFailed')}</span>
          <button type="button" className="secondary" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </p>
      )}
    </div>
  );
}
