'use client';
import { useEffect, useRef, type SyntheticEvent } from 'react';
import { placePhotoSize } from '../lib/place-photo-size';
export function usePlacePhotoSizing() {
  const ref = useRef<HTMLDivElement>(null),
    image = useRef<HTMLImageElement | null>(null);
  const update = () => {
    const box = ref.current,
      img = image.current;
    if (!box || !img || !img.naturalWidth) return;
    const size = placePhotoSize(
      box.clientWidth,
      box.clientHeight,
      img.naturalWidth,
      img.naturalHeight,
    );
    img.style.width = size.width + 'px';
    img.style.height = size.height + 'px';
  };
  useEffect(() => {
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const onLoadCapture = (event: SyntheticEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLImageElement) {
      image.current = event.target;
      update();
    }
  };
  return { ref, onLoadCapture };
}
