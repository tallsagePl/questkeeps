export type FrameSample = {
  colors: Uint8ClampedArray;
  detail: number;
};

export type FrameSignature = {
  id: string;
  favorite: boolean;
  pixels: number;
  frames: FrameSample[];
  duration?: number;
};

const size = 8;

const channels = 3;

const packedBytes = (size * size * channels) / 2;

function channel(colors: Uint8ClampedArray, pixel: number, component: number) {
  const sample = pixel * channels + component;
  return ((colors[sample >> 1] >> ((sample & 1) * 4)) & 0x0f) * 17;
}

export function sampleFrame(source: CanvasImageSource): FrameSample {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(source, 0, 0, size, size);
  const rgba = context.getImageData(0, 0, size, size).data;
  const colors = new Uint8ClampedArray((size * size * channels) / 2);
  let detail = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = y * size + x;
      for (let component = 0; component < channels; component++) {
        const quantized = rgba[pixel * 4 + component] >> 4;
        const sample = pixel * channels + component;
        colors[sample >> 1] |= quantized << ((sample & 1) * 4);
        if (x > 0)
          detail += Math.abs(
            quantized * 17 - channel(colors, pixel - 1, component),
          );
      }
    }
  }
  return { colors, detail };
}

function similar(first: FrameSignature, second: FrameSignature) {
  if (first.frames.length !== second.frames.length) return false;
  if (
    first.duration !== undefined &&
    second.duration !== undefined &&
    Math.abs(first.duration - second.duration) >
      Math.max(0.35, first.duration * 0.02)
  )
    return false;
  return first.frames.every(({ colors }, index) => {
    const other = second.frames[index].colors;
    if (colors.length !== other.length) return false;
    if (colors.length !== packedBytes) {
      if (colors.length === 0 || colors.length % 4 !== 0) return false;
      const legacyLimit = (colors.length / 4) * 3 * 12;
      let legacyDifference = 0;
      for (let pixel = 0; pixel < colors.length; pixel += 4) {
        legacyDifference += Math.abs(colors[pixel] - other[pixel]);
        legacyDifference += Math.abs(colors[pixel + 1] - other[pixel + 1]);
        legacyDifference += Math.abs(colors[pixel + 2] - other[pixel + 2]);
        if (legacyDifference > legacyLimit) return false;
      }
      return true;
    }
    const limit = size * size * channels * 12;
    let difference = 0;
    for (let pixel = 0; pixel < size * size; pixel++) {
      for (let component = 0; component < channels; component++) {
        difference += Math.abs(
          channel(colors, pixel, component) - channel(other, pixel, component),
        );
        if (difference > limit) return false;
      }
    }
    return true;
  });
}

export function reviewGroups(items: FrameSignature[]) {
  const detail = (item: FrameSignature) =>
    item.frames.reduce((sum, frame) => sum + frame.detail, 0);
  const ranked = [...items].sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      b.pixels - a.pixels ||
      detail(b) - detail(a),
  );
  const groups: FrameSignature[][] = [];
  for (const item of ranked) {
    const match = groups.find(([lead]) => similar(lead, item));
    if (match) match.push(item);
    else groups.push([item]);
  }
  return groups.filter((group) => group.length > 1);
}
