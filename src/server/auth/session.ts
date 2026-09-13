import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getAdminAuth } from '@/db/firestore';
import { getRepositories } from '@/db/repositories/firestore';
import type { Role, UserDoc } from '@/db/models';

/**
 * Server-side authentication (spec 9.3, 13.1).
 *
 * Flow: the browser signs in with Firebase Auth, sends the resulting ID token to
 * POST /api/auth/session, and the server exchanges it for an httpOnly session
 * cookie. Every request then verifies that cookie with the Admin SDK.
 *
 * The ROLE always comes from the user document in Firestore, never from the
 * token. A student cannot promote themselves by tampering with a client-side
 * claim, because the claim is not consulted.
 */

export const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 days

/** The signed-in user. Aliased so call sites read as authentication, not storage. */
export type AuthenticatedUser = UserDoc;

/** Exchanges a Firebase ID token for a session cookie value. */
export async function createSessionCookie(idToken: string): Promise<{
  value: string;
  maxAgeSeconds: number;
}> {
  const value = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });
  return { value, maxAgeSeconds: SESSION_MAX_AGE_MS / 1000 };
}

/**
 * True for the Admin SDK errors that genuinely mean "this cookie is no longer
 * a valid session": expired, revoked, malformed, or the user is gone.
 */
function isAuthTokenError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  return code.startsWith('auth/');
}

/**
 * Resolves the signed-in user, or null.
 *
 * Wrapped in React's `cache` so a page that calls it in a layout and again in a
 * component still verifies the cookie and reads the user document once per
 * request.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  let uid: string;
  try {
    // checkRevoked: a disabled or signed-out account stops working immediately.
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    uid = decoded.uid;
  } catch (error) {
    // An expired, revoked or malformed cookie is simply "not signed in" — but
    // ONLY a token error means that. Anything else (a misconfigured Admin SDK,
    // an unreachable Firestore) must surface instead of being disguised as a
    // signed-out user, which sends people to a login page that cannot help them.
    if (!isAuthTokenError(error)) {
      console.error(
        JSON.stringify({
          severity: 'ERROR',
          message: 'session verification failed for a non-token reason',
          error: String(error),
        }),
      );
      throw error;
    }
    return null;
  }

  // A failure to READ the user is not the same as being signed out, and must not
  // be silently reported as one: swallowing it would turn an outage into a
  // confusing "please sign in" on a page the user is already signed in to.
  try {
    return await getRepositories().users.get(uid);
  } catch (error) {
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: 'failed to load the signed-in user',
        uid,
        error: String(error),
      }),
    );
    throw error;
  }
});

export class AuthorizationError extends Error {
  constructor(
    /** Key in the `errors` dictionary section. */
    readonly key: 'unauthorized' | 'forbidden',
  ) {
    super(key);
    this.name = 'AuthorizationError';
  }
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('unauthorized');
  return user;
}

const ROLE_RANK: Record<Role, number> = { STUDENT: 0, INSTRUCTOR: 1, ADMIN: 2 };

/** True when `role` is at least as privileged as `minimum`. */
export function hasRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Requires at least the given role; admins pass every check. */
export async function requireRole(minimum: Role): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!hasRole(user.role, minimum)) throw new AuthorizationError('forbidden');
  return user;
}

/**
 * Role assigned to a brand-new account.
 *
 * Everyone starts as a STUDENT. The single exception is the bootstrap admin
 * email from the environment, which exists so the very first deployment has
 * someone who can promote the real instructors — otherwise nobody could.
 */
export function initialRoleFor(email: string): Role {
  const bootstrap = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (bootstrap && email.trim().toLowerCase() === bootstrap) return 'ADMIN';
  return 'STUDENT';
}
