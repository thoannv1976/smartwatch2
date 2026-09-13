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
  const user = await getCurrentUser().catch(() => null);
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
