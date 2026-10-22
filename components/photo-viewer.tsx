'use client';

import { useState } from 'react';
import MediaPreview from './media-preview';

export default function PhotoViewer({
  preview,
  original,
  scope,
  title,
}: {
  preview: string;
  original?: string;
  scope: string;
  title: string;
}) {
  const [originalState, setOriginalState] = useState('loading');
  return (
    <div className="photo-viewer-image" role="img" aria-label={title}>
      <MediaPreview src={preview} scope={scope} kind="photo" />
      {original && originalState !== 'failed' && (
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
    </div>
  );
}
