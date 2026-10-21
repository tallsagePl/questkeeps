import { accountToken } from './yandex';
import { driveIconSVG } from './drive-icon';
function avatarResponse(body: BodyInit, type: string, maxAge: number) {
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': maxAge
        ? 'private, max-age=' + maxAge
        : 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
}
export async function accountAvatar(accountId: string) {
  try {
    const token = await accountToken(accountId);
    const profile = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: 'OAuth ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!profile.ok) throw new Error('Profile unavailable');
    const data = await profile.json();
    const avatar = data.default_avatar_id;
    if (
      data.is_avatar_empty ||
      typeof avatar !== 'string' ||
      avatar.length > 200 ||
      !/^[-A-Za-z0-9_]+(?:\/[-A-Za-z0-9_]+)*$/.test(avatar)
    )
      throw new Error('No profile picture');
    const image = await fetch(
      'https://avatars.yandex.net/get-yapic/' +
        avatar +
        '/islands-retina-middle',
      { redirect: 'error', signal: AbortSignal.timeout(5000) },
    );
    const type = (image.headers.get('content-type') || '')
      .split(';')[0]
      .toLowerCase();
    if (
      !image.ok ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(type)
    ) {
      await image.body?.cancel();
      throw new Error('Image unavailable');
    }
    const reader = image.body?.getReader();
    if (!reader) throw new Error('Empty image');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw new Error('Oversized image');
      }
      chunks.push(chunk.value);
    }
    if (!size) throw new Error('Empty image');
    return avatarResponse(new Uint8Array(Buffer.concat(chunks)), type, 300);
  } catch {
    return avatarResponse(driveIconSVG, 'image/svg+xml', 0);
  }
}
