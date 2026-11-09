import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LOCALES } from '@/i18n';
import { readAppCookie, writeAppCookie } from '@/lib/app-cookie';

/**
 * Stores the visitor's language. The language shares the app cookie with the
 * session (see src/lib/app-cookie.ts), and that cookie is httpOnly, so it is
 * written here rather than from the browser.
 */

const bodySchema = z.object({ locale: z.enum(LOCALES as unknown as ['vi', 'en']) });

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const { session } = readAppCookie(await cookies());
  const response = NextResponse.json({ ok: true, locale: parsed.locale });
  writeAppCookie(response.cookies, { session, locale: parsed.locale });
  return response;
}
