import 'server-only';
import { redirect } from 'next/navigation';
import type { Role } from '@/db/models';
import { getCurrentUser, hasRole, type AuthenticatedUser } from './session';

/**
 * Page-level guards.
 *
 * Server components call these; an unauthenticated visitor is sent to the login
 * page with the path they wanted, and a visitor without the required role is
 * sent back with an explanation rather than shown an empty page.
 */

export async function requireUserPage(nextPath?: string): Promise<AuthenticatedUser> {
  // No catch here on purpose. getCurrentUser already returns null for the one
  // thing that means "not signed in" — an expired, revoked or malformed cookie
  // — and rethrows everything else. Catching that rethrow turned a Firestore or
  // Admin SDK outage into an endless /login ↔ /home bounce: signing in worked,
  // loading the user did not, and the user was sent back to sign in again. An
  // outage has to reach the error page, where it is visible and diagnosable.
  const user = await getCurrentUser();
  if (!user) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';
    redirect(target);
  }
  return user;
}

export async function requireRolePage(
  minimum: Role,
  nextPath?: string,
): Promise<AuthenticatedUser> {
  const user = await requireUserPage(nextPath);
  if (!hasRole(user.role, minimum)) {
    redirect('/home?error=forbidden');
  }
  return user;
}
