'use client';

import { PreviewPriority } from './preview-priority';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Layout = {
  visibleFirst: number;
  visibleLast: number;
  baseRow: number;
  columns: number;
  width: number;
  height: number;
  gap: number;
  first: number;
  last: number;
  totalHeight: number;
};

export default function VirtualGallery<T>({
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
  const [layout, setLayout] = useState<Layout | null>(null);
  const baseRow = useRef(0);
  const pendingScroll = useRef(0);
  const retainedKeys = useRef(new Set<string>());
  const pendingFocus = useRef<number | null>(null);
  const requestedJump = useRef<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const columns =
        style.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      const gap = parseFloat(style.gap) || 0;
      const width = (rect.width - gap * (columns - 1)) / columns;
      const sample = element.querySelector('.photo-card');
      const ratio = sample
        ? parseFloat(getComputedStyle(sample).aspectRatio.split('/')[0]) /
          (parseFloat(getComputedStyle(sample).aspectRatio.split('/')[1]) || 1)
        : 1.3;
      const height = width / ratio;
      const pitch = height + gap;
      const rows = Math.ceil(items.length / columns);
      if (!width || !pitch) return;

      // Recycle a bounded scroll surface instead of reserving space for history.
      // Compensate scroll position by exactly the removed/inserted row height.
      const windowRows = Math.min(rows, Math.ceil(innerHeight / pitch) + 3);
      const previousBase = baseRow.current;
      const localRow = Math.floor(-rect.top / pitch);
      baseRow.current = Math.max(
        0,
        Math.min(rows - windowRows, previousBase + localRow - 1),
      );
      const shift = baseRow.current - previousBase;
      const localTop = -rect.top - shift * pitch;
      pendingScroll.current -= shift * pitch;
      let visibleFirst = Math.max(0, Math.floor(localTop / pitch));
      if (visibleFirst * pitch + height <= localTop) visibleFirst++;
      const visibleLast = Math.max(
        visibleFirst + 1,
        Math.ceil((localTop + innerHeight) / pitch),
      );
      const first = Math.max(
        baseRow.current,
        baseRow.current + visibleFirst - 1,
      );
      const last = Math.min(
        rows,
        baseRow.current + windowRows,
        baseRow.current + visibleLast + 1,
      );
      const totalHeight = Math.max(0, windowRows * pitch - gap);
      const next = {
        visibleFirst: (baseRow.current + visibleFirst) * columns,
        visibleLast: Math.min(
          items.length,
          (baseRow.current + visibleLast) * columns,
        ),
        baseRow: baseRow.current,
        columns,
        width,
        height,
        gap,
        first: first * columns,
        last: Math.min(items.length, last * columns),
        totalHeight,
      };
      setLayout((old) =>
        old &&
        Object.keys(next).every(
          (key) => old[key as keyof Layout] === next[key as keyof Layout],
        )
          ? old
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const scroll = schedule;
    const start = () => {
      baseRow.current = 0;
      pendingScroll.current = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
      measure();
    };
    window.addEventListener('questkeeps:gallery-start', start);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      window.removeEventListener('questkeeps:gallery-start', start);
      observer.disconnect();
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [items.length, resetKey]);
  function jumpTo(target: number) {
    if (!layout || !root.current) return;
    setHighlightedKey(itemKey(items[target]));
    pendingFocus.current = target;
    const pitch = layout.height + layout.gap;
    const rows = Math.ceil(items.length / layout.columns);
    const windowRows = Math.min(rows, Math.ceil(innerHeight / pitch) + 3);
    const row = Math.floor(target / layout.columns);
    baseRow.current = Math.max(0, Math.min(rows - windowRows, row - 1));
    const top =
      root.current!.getBoundingClientRect().top +
      window.scrollY +
      (row - baseRow.current) * pitch;
    pendingScroll.current = 0;
    setLayout({
      ...layout,
      visibleFirst: row * layout.columns,
      visibleLast: Math.min(
        items.length,
        (row + Math.ceil(innerHeight / pitch)) * layout.columns,
      ),
      baseRow: baseRow.current,
      first: baseRow.current * layout.columns,
      last: Math.min(
        items.length,
        (baseRow.current + windowRows) * layout.columns,
      ),
      totalHeight: windowRows * pitch - layout.gap,
    });
    window.scrollTo({ top: Math.max(0, top - 24), behavior: 'instant' });
  }
  useLayoutEffect(() => {
    if (!layout || !initialItemKey || requestedJump.current === initialItemKey)
      return;
    const target = items.findIndex((item) => itemKey(item) === initialItemKey);
    if (target < 0) return;
    requestedJump.current = initialItemKey;
    jumpTo(target);
  }, [layout, initialItemKey, items]);
  useLayoutEffect(() => {
    if (!highlightedKey) return;
    const timer = setTimeout(() => setHighlightedKey(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedKey]);
  useLayoutEffect(() => {
    if (pendingScroll.current) {
      window.scrollBy({ top: pendingScroll.current, behavior: 'instant' });
      pendingScroll.current = 0;
    }
    if (pendingFocus.current === null) return;
    const button = root.current?.querySelector<HTMLElement>(
      '[data-media-index="' + pendingFocus.current + '"] .photo-card',
    );
    if (button) {
      button.focus({ preventScroll: true });
      pendingFocus.current = null;
      if (initialItemKey) onTargetReached?.();
    }
  }, [layout]);
  const first = layout?.first || 0;
  const last = layout?.last ?? Math.min(items.length, 3);
  // Retain previously visited elements so their image nodes and loaded state survive.
  // Hidden cells take no layout space and are excluded from keyboard navigation.
  useLayoutEffect(() => {
    for (const item of items.slice(first, last))
      retainedKeys.current.add(itemKey(item));
  });
  return (
    <div
      ref={root}
      className="photo-grid virtual-gallery"
      style={layout ? { height: layout.totalHeight } : undefined}
      data-total={items.length}
      data-base-row={layout?.baseRow || 0}
      onKeyDown={(event) => {
        if (!layout) return;
        const cell = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-media-index]',
        );
        if (!cell) return;
        const index = Number(cell.dataset.mediaIndex);
        const delta =
          event.key === 'ArrowRight'
            ? 1
            : event.key === 'ArrowLeft'
              ? -1
              : event.key === 'ArrowDown'
                ? layout.columns
                : event.key === 'ArrowUp'
                  ? -layout.columns
                  : event.key === 'Tab'
                    ? event.shiftKey
                      ? -1
                      : 1
                    : 0;
        let target =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : index + delta;
        if (!delta && event.key !== 'Home' && event.key !== 'End') return;
        if (target < 0 || target >= items.length) return;
        // Normal Tab navigation can handle neighbors that are already mounted.
        if (event.key === 'Tab' && target >= first && target < last) return;
        event.preventDefault();
        jumpTo(target);
      }}
    >
      {items.map((item, index) => {
        const active = index >= first && index < last;
        if (!active && !retainedKeys.current.has(itemKey(item))) return null;
        return (
          <div
            className="virtual-gallery-cell"
            key={itemKey(item)}
            data-media-index={index}
            data-gallery-target={
              itemKey(item) === highlightedKey ? true : undefined
            }
            hidden={!active}
            style={
              layout
                ? {
                    display: active ? undefined : 'none',
                    position: 'absolute',
                    width: layout.width,
                    height: layout.height,
                    left:
                      (index % layout.columns) * (layout.width + layout.gap),
                    top:
                      (Math.floor(index / layout.columns) - layout.baseRow) *
                      (layout.height + layout.gap),
                  }
                : undefined
            }
          >
            <PreviewPriority.Provider
              value={
                !active
                  ? null
                  : !layout ||
                      (index >= layout.visibleFirst &&
                        index < layout.visibleLast)
                    ? 0
                    : 1
              }
            >
              {renderItem(item)}
            </PreviewPriority.Provider>
          </div>
        );
      })}
    </div>
  );
}
