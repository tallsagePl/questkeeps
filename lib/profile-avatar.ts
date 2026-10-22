import sharp from 'sharp';
import { fail } from './access';

export async function readAvatar(req: Request) {
  const max = 5 * 1024 * 1024;
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(
      req.headers.get('content-type') || '',
    )
  )
    fail(400, 'Выберите фотографию JPG, PNG или WebP');
  const reader = req.body?.getReader();
  if (!reader) fail(400, 'Выберите фотографию');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, 'Фотография должна быть не больше 5 МБ');
    }
    chunks.push(chunk.value);
  }
  try {
    const input = Buffer.concat(chunks);
    const meta = await sharp(input, { limitInputPixels: 25000000 }).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format || '') ||
      (meta.pages || 1) > 1
    )
      throw new Error('Unsupported photo');
    return await sharp(input, { limitInputPixels: 25000000 })
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    fail(
      400,
      'Не удалось прочитать фотографию. Выберите другой JPG, PNG или WebP',
    );
  }
}
