'use client';

import { PreviewPriority } from './preview-priority';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export default function VirtualPlaces<T>({
  items,
  itemKey,
  renderItem,
  resetKey,
  initialItemKey,
  onTargetReached,
}: {
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  resetKey: string;
  initialItemKey?: string | null;
  onTargetReached?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState<Set<number>>(() => new Set());
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const requestedJump = useRef<string | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observed = new Set<number>();
    // Cards stay in native document flow at their own height. Only expensive
    // images and descriptions near the viewport become eligible to load.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(
            (entry.target as HTMLElement).dataset.placeIndex,
          );
          if (entry.isIntersecting) observed.add(index);
          else observed.delete(index);
        }
        setNear(new Set(observed));
      },
      { rootMargin: '600px 0px' },
    );
    for (const cell of element.children) observer.observe(cell);
    return () => observer.disconnect();
  }, [items.length, resetKey]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const preserveFocus = () => {
      const card = (
        document.activeElement as HTMLElement | null
      )?.closest<HTMLElement>('.discovered-place');
      if (!card || !root.current?.contains(card)) return;
      clearTimeout(timer);
      timer = setTimeout(
        () => card.scrollIntoView({ block: 'nearest', behavior: 'instant' }),
        100,
      );
    };
    const cancel = () => clearTimeout(timer);
    window.addEventListener('resize', preserveFocus);
    window.addEventListener('pointerdown', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', preserveFocus);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, []);

  useLayoutEffect(() => {
    if (!initialItemKey) {
      requestedJump.current = null;
      return;
    }
    if (requestedJump.current === initialItemKey) return;
    const index = items.findIndex((item) => itemKey(item) === initialItemKey);
    if (index < 0) return;
    // Wait for the photo viewer to restore its focus before navigating here.
    const frame = requestAnimationFrame(() => {
      const card = root.current?.querySelector<HTMLElement>(
        '[data-place-index="' + index + '"] .discovered-place',
      );
      if (!card) return;
      requestedJump.current = initialItemKey;
      setHighlightedKey(initialItemKey);
      card.scrollIntoView({ block: 'start', behavior: 'instant' });
      card.focus({ preventScroll: true });
      onTargetReached?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialItemKey, items]);

  useEffect(() => {
    if (!highlightedKey) return;
    const timer = setTimeout(() => setHighlightedKey(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedKey]);

  return (
    <div
      ref={root}
      className="discovered-place-grid virtual-places"
      data-total={items.length}
      data-base-row={near.size ? Math.min(...near) : 0}
    >
      {items.map((item, index) => (
        <StablePlaceCell
          key={itemKey(item)}
          item={item}
          index={index}
          near={near.has(index)}
          highlighted={itemKey(item) === highlightedKey}
          renderItem={renderItem}
        />
      ))}
    </div>
  );
}

function PlaceCell<T>({
  item,
  index,
  near,
  highlighted,
  renderItem,
}: {
  item: T;
  index: number;
  near: boolean;
  highlighted: boolean;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div
      className="virtual-places-cell"
      data-place-index={index}
      data-near={near}
      data-place-target={highlighted ? true : undefined}
    >
      <PreviewPriority.Provider value={near ? 0 : null}>
        {renderItem(item)}
      </PreviewPriority.Provider>
    </div>
  );
}

// Entering a new viewport row must not re-render every earlier card.
const StablePlaceCell = memo(PlaceCell) as typeof PlaceCell;
