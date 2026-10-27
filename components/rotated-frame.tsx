'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// A quarter turn swaps the available axes before fitting the image, avoiding
// clipping or oversized portraits on narrow screens. Resizing never refetches it.
export default function RotatedFrame({
  rotation = 0,
  children,
}: {
  rotation?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const quarter = rotation % 180 !== 0;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !quarter) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [quarter]);
  return (
    <div ref={ref} className="rotation-frame" data-rotation={rotation}>
      <div
        className="rotation-frame-content"
        style={{
          width: quarter ? size.height : '100%',
          height: quarter ? size.width : '100%',
          transform: 'translate(-50%, -50%) rotate(' + rotation + 'deg)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
