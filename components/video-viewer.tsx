'use client';

import { useState } from 'react';
import { useLocale } from './appearance';

export default function VideoViewer({ src }: { src: string }) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  return (
    <div className="video-viewer">
      <video
        className="viewer"
        controls
        playsInline
        preload="metadata"
        src={src}
        onError={() => setFailed(true)}
        onLoadedMetadata={() => setFailed(false)}
      />
      {failed && (
        <p role="status" className="video-playback-error">
          {t('media.videoPlaybackFailed')}
        </p>
      )}
    </div>
  );
}
