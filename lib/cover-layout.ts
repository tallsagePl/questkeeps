import type { CoverPosition } from './contracts';

export function coverLayout(
  width: number,
  height: number,
  frameWidth: number,
  frameHeight: number,
  rotation = 0,
  position: CoverPosition = { x: 50, y: 50 },
) {
  const quarter = Math.abs(rotation % 180) === 90;
  const orientedWidth = quarter ? height : width;
  const orientedHeight = quarter ? width : height;
  const scale =
    width && height
      ? Math.max(frameWidth / orientedWidth, frameHeight / orientedHeight)
      : 0;
  const overflowX = Math.max(0, orientedWidth * scale - frameWidth);
  const overflowY = Math.max(0, orientedHeight * scale - frameHeight);
  return {
    width: width * scale,
    height: height * scale,
    left: frameWidth / 2 - overflowX * (position.x / 100 - 0.5),
    top: frameHeight / 2 - overflowY * (position.y / 100 - 0.5),
    overflowX,
    overflowY,
  };
}

export const clampPosition = (value: number) =>
  Math.max(0, Math.min(100, value));
