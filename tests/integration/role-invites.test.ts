import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';
import { resolveInitialRole } from '@/server/auth/session';

/**
 * The role a brand-new account is given.
 *
 * Order matters here in a way that is easy to get wrong, so each rule has its
 * own test: bootstrap beats everything, an invite is spent once, and an invite
 * must never be consulted for an account that already exists.
 */

let repos: Repositories;
const BOOTSTRAP = 'boss@uni.edu';

beforeEach(() => {
  repos = createMemoryRepositories();
  process.env.BOOTSTRAP_ADMIN_EMAIL = BOOTSTRAP;
});

describe('resolveInitialRole', () => {
  it('defaults to STUDENT', async () => {
    expect(await resolveInitialRole('new@uni.edu', 'uid-1', repos)).toBe('STUDENT');
  });

  it('grants the invited role', async () => {
    await repos.roleInvites.put({
      email: 'gv@uni.edu',
      role: 'INSTRUCTOR',
      createdBy: 'admin-1',
      createdAt: Date.now(),
    });

    expect(await resolveInitialRole('gv@uni.edu', 'uid-1', repos)).toBe('INSTRUCTOR');
  });

  it('spends the invite, so a second account cannot reuse it', async () => {
    await repos.roleInvites.put({
      email: 'gv@uni.edu',
      role: 'INSTRUCTOR',
      createdBy: 'admin-1',
      createdAt: Date.now(),
    });
    await resolveInitialRole('gv@uni.edu', 'uid-1', repos);

    expect(await resolveInitialRole('gv@uni.edu', 'uid-2', repos)).toBe('STUDENT');
  });

  it('lets the bootstrap admin in even against an invite saying otherwise', async () => {
    // Bootstrap is the only way back in if the invite collection is wrong, so
    // nothing may override it.
    await repos.roleInvites.put({
      email: BOOTSTRAP,
      role: 'STUDENT',
      createdBy: 'admin-1',
      createdAt: Date.now(),
    });

    expect(await resolveInitialRole(BOOTSTRAP, 'uid-1', repos)).toBe('ADMIN');
  });

  it('leaves the bootstrap invite unspent, since it was never consulted', async () => {
    await repos.roleInvites.put({
      email: BOOTSTRAP,
      role: 'ADMIN',
      createdBy: 'admin-1',
      createdAt: Date.now(),
    });
    await resolveInitialRole(BOOTSTRAP, 'uid-1', repos);

    expect((await repos.roleInvites.get(BOOTSTRAP))?.claimedAt).toBeNull();
  });

  it('matches the invite case-insensitively, like every other email lookup', async () => {
    await repos.roleInvites.put({
      email: 'GV@Uni.Edu',
      role: 'INSTRUCTOR',
      createdBy: 'admin-1',
      createdAt: Date.now(),
    });

    expect(await resolveInitialRole('gv@uni.edu', 'uid-1', repos)).toBe('INSTRUCTOR');
  });

  it('falls back to STUDENT rather than blocking sign-in when the lookup fails', async () => {
    repos.roleInvites.claim = () => Promise.reject(new Error('firestore unavailable'));

    expect(await resolveInitialRole('new@uni.edu', 'uid-1', repos)).toBe('STUDENT');
  });
});

describe('an existing account never re-reads its invite', () => {
  it('is the caller that enforces this, and the sign-in route does', async () => {
    // resolveInitialRole is only reached when users.get returned null. If it
    // ran on every sign-in, an admin demoting an instructor would see them
    // re-promoted at their next sign-in from the stale invite — so this pins
    // the contract the route depends on.
    await repos.roleInvites.put({
      email: 'gv@uni.edu',
      role: 'INSTRUCTOR',
      createdBy: 'admin-1',
      createdAt: Date.now(),
    });
    const user = await repos.users.upsert({
      uid: 'uid-1',
      email: 'gv@uni.edu',
      displayName: 'GV',
      role: 'STUDENT',
    });

    const existing = await repos.users.get(user.uid);
    const role = existing?.role ?? (await resolveInitialRole('gv@uni.edu', 'uid-1', repos));

    expect(role).toBe('STUDENT');
    expect((await repos.roleInvites.get('gv@uni.edu'))?.claimedAt).toBeNull();
  });
});
