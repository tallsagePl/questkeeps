import type { MediaItem } from './contracts';

export type ShareFormat = 'post' | 'stories';

export type ShareCard = { file: File; url: string };

export function shareablePhotos(media: MediaItem[]) {
  return media.filter(
    (photo) =>
      photo.kind === 'photo' &&
      !photo.hidden &&
      !photo.hidden_from_guests &&
      !photo.missing,
  );
}

function textLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxLines: number,
) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ');
  const lines: string[] = [];
  // Two-line headlines use a balanced word break. Only an individual word
  // wider than the entire card is split, so names never break arbitrarily.
  let balanced: string[] | null = null;
  let balance = Infinity;
  if (maxLines === 2 && ctx.measureText(normalized).width > width) {
    for (let at = 1; at < words.length; at++) {
      const left = words.slice(0, at).join(' ');
      const right = words.slice(at).join(' ');
      const first = ctx.measureText(left).width;
      const second = ctx.measureText(right).width;
      if (
        first <= width &&
        second <= width &&
        Math.abs(first - second) < balance
      ) {
        balance = Math.abs(first - second);
        balanced = [left, right];
      }
    }
  }
  if (balanced) lines.push(...balanced);
  else {
    let line = '';
    for (const word of words) {
      if (ctx.measureText(word).width > width) {
        if (line) {
          lines.push(line);
          line = '';
        }
        for (const char of Array.from(word)) {
          if (line && ctx.measureText(line + char).width > width) {
            lines.push(line);
            line = char;
          } else line += char;
        }
      } else if (!line || ctx.measureText(line + ' ' + word).width <= width)
        line += (line ? ' ' : '') + word;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = visible[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > width)
      last = last.slice(0, -1);
    visible[maxLines - 1] = last + '…';
  }
  visible.forEach((value, index) =>
    ctx.fillText(value, x, y + index * lineHeight),
  );
}

function frame(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  rotation: number,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.clip();
  ctx.fillStyle = '#202536';
  ctx.fillRect(x, y, width, height);
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const quarter = rotation % 180 !== 0;
  const targetWidth = quarter ? height : width;
  const targetHeight = quarter ? width : height;
  const scale =
    fit === 'cover'
      ? Math.max(targetWidth / image.width, targetHeight / image.height)
      : Math.min(targetWidth / image.width, targetHeight / image.height);
  ctx.drawImage(
    image,
    (-image.width * scale) / 2,
    (-image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
  ctx.restore();
}

async function bitmap(src: string, signal: AbortSignal) {
  const response = await fetch(src, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
    credentials: 'same-origin',
  });
  if (!response.ok) throw Error('exports.photoUnavailable');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw Error('exports.photoUnavailable');
  try {
    return await createImageBitmap(blob);
  } catch {
    throw Error('exports.photoUnavailable');
  }
}

export async function createShareCards(options: {
  format: ShareFormat;
  photos: { src: string; rotation?: number; title: string }[];
  headline: string;
  destination: string;
  dates: string;
  footer: string;
  action: string;
  collection: string;
  fit: 'cover' | 'contain';
  signal: AbortSignal;
  onProgress: (current: number, total: number) => void;
}): Promise<ShareCard[]> {
  if (options.photos.length < 1 || options.photos.length > 5)
    throw Error('exports.choosePhotos');
  await document.fonts.ready;
  options.signal.throwIfAborted();
  const font = getComputedStyle(document.body).fontFamily;
  const outputs: ShareCard[] = [];
  const images: ImageBitmap[] = [];
  const stories = options.format === 'stories';
  const total = stories ? options.photos.length : 1;
  try {
    for (const photo of options.photos) {
      options.signal.throwIfAborted();
      images.push(await bitmap(photo.src, options.signal));
    }
    for (let index = 0; index < total; index++) {
      options.signal.throwIfAborted();
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = stories ? 1920 : 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('exports.couldNotCreate');
      ctx.fillStyle = '#10131C';
      ctx.fillRect(0, 0, 1080, canvas.height);
      const top = stories ? 150 : 84;
      ctx.fillStyle = '#B5B8FF';
      ctx.save();
      ctx.translate(60, top - 44);
      ctx.scale(0.15, 0.15);
      for (const path of [
        'M166 32C89 32 42 86 42 168C42 250 89 304 166 304C243 304 290 250 290 168C290 86 243 32 166 32ZM166 77C214 77 242 110 242 168C242 226 214 259 166 259C118 259 90 226 90 168C90 110 118 77 166 77Z',
        'M144 156L210 166L194 182L312 300L288 324L170 206L154 222Z',
        'M332 40H379V151L477 53L461 37L541 23L527 103L511 87L420 178L547 310H483L379 201V310H332Z',
      ])
        ctx.fill(new Path2D(path), 'evenodd');
      ctx.restore();
      ctx.fillStyle = '#F7F8FF';
      ctx.font = '600 38px ' + font;
      ctx.fillText('QuestKeeps', 158, top);
      ctx.fillStyle = '#AAAFC1';
      ctx.font = '400 26px ' + font;
      ctx.textAlign = 'right';
      ctx.fillText(
        stories
          ? String(index + 1).padStart(2, '0') +
              ' / ' +
              String(total).padStart(2, '0')
          : options.collection,
        1018,
        top,
      );
      ctx.textAlign = 'left';
      ctx.fillStyle = '#B5B8FF';
      ctx.font = '500 28px ' + font;
      textLines(ctx, options.destination, 60, top + 88, 960, 36, 1);
      ctx.fillStyle = '#F7F8FF';
      ctx.font = '700 64px ' + font;
      textLines(ctx, options.headline, 60, top + 175, 960, 78, 2);
      const photoTop = stories ? 470 : 398;
      const photoHeight = stories ? 980 : 610;
      if (stories || images.length === 1)
        frame(
          ctx,
          images[stories ? index : 0],
          options.photos[stories ? index : 0].rotation || 0,
          40,
          photoTop,
          1000,
          photoHeight,
          options.fit,
        );
      else {
        frame(
          ctx,
          images[0],
          options.photos[0].rotation || 0,
          40,
          photoTop,
          610,
          photoHeight,
          options.fit,
        );
        const smallHeight =
          (photoHeight - 12 * (images.length - 2)) / (images.length - 1);
        for (let n = 1; n < images.length; n++)
          frame(
            ctx,
            images[n],
            options.photos[n].rotation || 0,
            662,
            photoTop + (n - 1) * (smallHeight + 12),
            378,
            smallHeight,
            options.fit,
          );
      }
      const infoTop = photoTop + photoHeight + 64;
      ctx.fillStyle = '#AAAFC1';
      ctx.font = '400 28px ' + font;
      ctx.fillText(options.dates, 60, infoTop);
      ctx.fillStyle = '#F7F8FF';
      ctx.font = '500 34px ' + font;
      textLines(
        ctx,
        stories ? options.photos[index].title : options.footer,
        60,
        infoTop + 62,
        960,
        44,
        1,
      );
      const actionY = stories ? 1680 : 1218;
      ctx.fillStyle = '#B5B8FF';
      ctx.beginPath();
      ctx.roundRect(60, actionY - 52, 960, 88, 22);
      ctx.fill();
      ctx.fillStyle = '#10131C';
      ctx.font = '600 32px ' + font;
      ctx.textAlign = 'center';
      ctx.fillText(options.action, 540, actionY + 4);
      ctx.fillStyle = '#AAAFC1';
      ctx.font = '400 26px ' + font;
      ctx.fillText('questkeeps.ru', 540, actionY + 86);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(Error('exports.couldNotCreate')),
          'image/png',
        ),
      );
      options.signal.throwIfAborted();
      const file = new File(
        [blob],
        'questkeeps-' + (stories ? 'story-' + (index + 1) : 'post') + '.png',
        { type: 'image/png' },
      );
      outputs.push({ file, url: URL.createObjectURL(file) });
      canvas.width = 0;
      canvas.height = 0;
      options.onProgress(index + 1, total);
    }
    return outputs;
  } catch (error) {
    outputs.forEach((card) => URL.revokeObjectURL(card.url));
    throw error;
  } finally {
    images.forEach((image) => image.close());
  }
}
