'use client';

import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import type { CoverPosition } from '../lib/contracts';
import { coverLayout, clampPosition } from '../lib/cover-layout';

export default function CoverPhotoFrame({
  src,
  rotation = 0,
  position = { x: 50, y: 50 },
  onChange,
  onReady,
  onOverflow,
}: {
  src: string;
  rotation?: number;
  position?: CoverPosition;
  onChange?: (position: CoverPosition) => void;
  onReady?: () => void;
  onOverflow?: (overflow: { x: boolean; y: boolean }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState({ width: 0, height: 0 });
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    position: CoverPosition;
  } | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize(entry.contentRect),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const layout = coverLayout(
    image.width,
    image.height,
    size.width,
    size.height,
    rotation,
    position,
  );
  useEffect(() => {
    onOverflow?.({ x: layout.overflowX > 1, y: layout.overflowY > 1 });
  }, [layout.overflowX, layout.overflowY, onOverflow]);
  return (
    <div
      ref={ref}
      className={'cover-photo-frame' + (onChange ? ' is-adjustable' : '')}
      onPointerDown={(event) => {
        if (!onChange || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          position,
        };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!onChange || !start || start.pointer !== event.pointerId) return;
        onChange({
          x:
            layout.overflowX > 0
              ? clampPosition(
                  start.position.x -
                    ((event.clientX - start.x) / layout.overflowX) * 100,
                )
              : position.x,
          y:
            layout.overflowY > 0
              ? clampPosition(
                  start.position.y -
                    ((event.clientY - start.y) / layout.overflowY) * 100,
                )
              : position.y,
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(event) => {
          setImage({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
          onReady?.();
        }}
        style={{
          position: 'absolute',
          width: layout.width,
          height: layout.height,
          left: '50%',
          top: '50%',
          transform:
            'translate(calc(-50% + ' +
            (layout.left - size.width / 2) +
            'px), calc(-50% + ' +
            (layout.top - size.height / 2) +
            'px)) rotate(' +
            rotation +
            'deg)',
          maxWidth: 'none',
          visibility: image.width ? 'visible' : 'hidden',
        }}
      />
    </div>
  );
}
