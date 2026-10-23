import { withMessageTranslations } from '../i18n/messages';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail } from '../access';

export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'messages.invalidDate',
  );

export const dates = z
  .object({ start: day, end: day })
  .refine((v) => v.start <= v.end, 'messages.endDateIsEarlierThanTheStart');

export const appURL = () => process.env.APP_URL || 'http://localhost:3000';

export function json(data: unknown, status = 200) {
  return NextResponse.json(withMessageTranslations(data), {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function body(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) fail(400, 'messages.emptyRequest');
  const chunks = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 65536) {
      await reader.cancel();
      fail(413, 'messages.requestIsTooLarge');
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, 'messages.invalidJson');
  }
}

export function bounds(
  input: { start: string; end: string },
  trip: { start: string; end: string },
) {
  if (input.start < trip.start || input.end > trip.end)
    fail(400, 'messages.participationDatesMustBeWithinTheTrip');
}
