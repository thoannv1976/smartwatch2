import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth } from '@/db/firestore';
import { getRepositories } from '@/db/repositories/firestore';
import { createSessionCookie, resolveInitialRole } from '@/server/auth/session';
import { readAppCookie, writeAppCookie } from '@/lib/app-cookie';

/**
 * Exchanges a Firebase ID token for an httpOnly session cookie, and creates the
 * user document on first sign-in.
 *
 * The ID token is verified server-side before anything is written, so a caller
 * cannot invent an email, a uid or a role.
 */

const bodySchema = z.object({ idToken: z.string().min(10) });

export async function POST(request: Request) {
  let parsed: { idToken: string };
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(parsed.idToken, true);
    const email = (decoded.email ?? '').toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'email_required' }, { status: 400 });
    }

    const repos = getRepositories();
    const existing = await repos.users.get(decoded.uid);

    // An existing user keeps the role they were granted. Invites are consulted
    // ONLY for a brand-new account: re-reading them on every sign-in would let
    // a stale invite silently undo an admin's later demotion.
    const role = existing?.role ?? (await resolveInitialRole(email, decoded.uid, repos));

    const user = await repos.users.upsert({
      uid: decoded.uid,
      email,
      displayName: decoded.name ?? existing?.displayName ?? email.split('@')[0] ?? email,
      role,
    });

    const { value } = await createSessionCookie(parsed.idToken);

    const response = NextResponse.json({ role: user.role, displayName: user.displayName });
    // Keep the visitor's language; replace only the session part.
    const { locale } = readAppCookie(await cookies());
    writeAppCookie(response.cookies, { session: value, locale });
    return response;
  } catch (error) {
    console.error(
      JSON.stringify({ severity: 'WARNING', message: 'session exchange failed', error: String(error) }),
    );
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
}

/** Sign out: clears the session but keeps the language preference. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  const { locale } = readAppCookie(await cookies());
  writeAppCookie(response.cookies, { session: null, locale });
  return response;
}
