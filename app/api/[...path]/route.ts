import { NextRequest, after } from 'next/server';
import { handle } from '@/lib/api';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

async function route(req: NextRequest, ctx: Context) {
  return handle(req, (await ctx.params).path, (task) => after(task));
}

export {
  route as GET,
  route as POST,
  route as PATCH,
  route as DELETE,
  route as PUT,
};
