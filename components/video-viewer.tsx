'use client';

import { useEffect, useRef, useState } from 'react';
import { I18nProvider } from '@videojs/react/i18n';
import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import './video-viewer.css';
import { useLocale } from './appearance';

export default function VideoViewer({ src }: { src: string }) {
  return <Playback key={src} src={src} />;
}

function Playback({ src }: { src: string }) {
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
        <VideoPlayer>
          <VideoSkin className="questkeeps-video-player">
            <Video
              ref={video}
              playsInline
              preload="metadata"
              src={src}
              onError={() => setFailed(true)}
              onLoadedMetadata={() => setFailed(false)}
            />
          </VideoSkin>
        </VideoPlayer>
      </I18nProvider>
      {failed && (
        <p role="status" className="video-playback-error">
          {t('media.videoPlaybackFailed')}
        </p>
      )}
    </div>
  );
}
