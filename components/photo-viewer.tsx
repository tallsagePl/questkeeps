'use client';

import RotatedFrame from './rotated-frame';
import { useState } from 'react';
import MediaPreview from './media-preview';

export default function PhotoViewer({
  preview,
  original,
  scope,
  title,
  rotation,
}: {
  preview: string;
  original?: string;
  scope: string;
  title: string;
  rotation?: number;
}) {
  const [originalState, setOriginalState] = useState('loading');
  const [previewReady, setPreviewReady] = useState(false);
  const connection =
    typeof navigator === 'undefined'
      ? undefined
      : (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }
        ).connection;
  const low =
    connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
  return (
    <div className="photo-viewer-image" role="img" aria-label={title}>
      <RotatedFrame rotation={rotation}>
        <MediaPreview
          src={preview}
          scope={scope}
          kind="photo"
          size="viewer"
          onReady={() => setPreviewReady(true)}
        />
        {original && previewReady && !low && originalState !== 'failed' && (
          <img
            className="viewer-original"
            data-state={originalState}
            src={original}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            onLoad={() => setOriginalState('loaded')}
            onError={() => setOriginalState('failed')}
          />
        )}
      </RotatedFrame>
    </div>
  );
}
