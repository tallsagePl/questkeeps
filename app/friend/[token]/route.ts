import { NextRequest, NextResponse } from 'next/server';
import { pendingFriendCookie, validFriendToken } from '@/lib/friend-links';
export const dynamic = 'force-dynamic';
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const response = NextResponse.redirect(
    new URL(
      validFriendToken(token) ? '/?friend=1' : '/?friend=invalid',
      process.env.APP_URL || req.url,
    ),
  );
  response.headers.set('Cache-Control', 'private, no-store');
  if (validFriendToken(token))
    response.cookies.set(pendingFriendCookie, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(process.env.APP_URL || req.url).protocol === 'https:',
      maxAge: 7 * 86400,
    });
  else
    response.cookies.set(pendingFriendCookie, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
    });
  return response;
}
// Link scanners and prefetches must never change a friendship.
export async function HEAD() {
  return new Response(null, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
