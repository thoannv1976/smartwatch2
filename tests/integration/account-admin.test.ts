import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '@/db/repositories/memory';
import type { Repositories } from '@/db/repositories/types';
import { AccountAdminService } from '@/server/auth/account-admin';
import { FakeAuthAdmin } from '../fakes/auth-admin';

/**
 * Creating accounts and setting passwords.
 *
 * The Admin SDK needs real credentials, so without the AuthAdmin port none of
 * this — the riskiest code in the app — would have a test at all.
 */

let repos: Repositories;
let auth: FakeAuthAdmin;
let service: AccountAdminService;

const ADMIN_UID = 'admin-1';

beforeEach(() => {
  repos = createMemoryRepositories();
  auth = new FakeAuthAdmin();
  service = new AccountAdminService(repos, auth);
});

function create(overrides: Partial<Parameters<AccountAdminService['createAccount']>[0]> = {}) {
  return service.createAccount({
    email: 'sv01@uni.edu',
    displayName: 'Nguyen Van A',
    role: 'STUDENT',
    password: 'correct-horse',
    ...overrides,
  });
}

describe('creating an account', () => {
  it('creates the sign-in account and the user document together', async () => {
    const result = await create();

    expect(result.ok).toBe(true);
    const uid = (result as { data: { uid: string } }).data.uid;

    // Visible in the admin list immediately, with the role given — not only
    // after the person first signs in.
    const doc = await repos.users.get(uid);
    expect(doc?.email).toBe('sv01@uni.edu');
    expect(doc?.role).toBe('STUDENT');
    expect(await auth.getAccount(uid)).not.toBeNull();
  });

  it('stores the chosen role, which then wins at first sign-in', async () => {
    const result = await create({ role: 'INSTRUCTOR' });
    const uid = (result as { data: { uid: string } }).data.uid;

    const doc = await repos.users.get(uid);
    // The sign-in route reads `existing?.role ?? resolveInitialRole(...)`.
    expect(doc?.role).toBe('INSTRUCTOR');
  });

  it('lowercases the email, like every other email path', async () => {
    const result = await create({ email: 'SV01@Uni.Edu' });
    const uid = (result as { data: { uid: string } }).data.uid;

    expect((await repos.users.get(uid))?.email).toBe('sv01@uni.edu');
    expect(await repos.users.getByEmail('sv01@uni.edu')).not.toBeNull();
  });

  it('drops a pending invite for the same address', async () => {
    // Creating the account directly settles the role, so the invite would only
    // sit there unused.
    await repos.roleInvites.put({
      email: 'sv01@uni.edu',
      role: 'INSTRUCTOR',
      createdBy: ADMIN_UID,
      createdAt: Date.now(),
    });

    await create();

    expect(await repos.roleInvites.get('sv01@uni.edu')).toBeNull();
  });

  it('refuses an address that already has an account and a user document', async () => {
    await create();
    expect(await create()).toEqual({ ok: false, error: 'emailAlreadyExists' });
  });

  it('adopts a sign-in account whose user document was lost', async () => {
    // Otherwise this is a dead end: the address cannot be created because the
    // Auth account exists, and cannot be managed because the document does not.
    auth.seed({
      uid: 'orphan-uid',
      email: 'sv01@uni.edu',
      displayName: 'Orphan',
      providers: ['password'],
    });

    const result = await create({ role: 'INSTRUCTOR' });

    expect(result).toMatchObject({ ok: true, data: { uid: 'orphan-uid', adopted: true } });
    expect((await repos.users.get('orphan-uid'))?.role).toBe('INSTRUCTOR');
  });

  it('refuses a password the auth provider rejects', async () => {
    expect(await create({ password: 'short' })).toEqual({ ok: false, error: 'weakPassword' });
  });

  it('refuses an address that is not an address', async () => {
    expect(await create({ email: 'not-an-email' })).toEqual({ ok: false, error: 'invalidInput' });
  });

  it('writes no user document when the account could not be created', async () => {
    await create({ password: 'short' });
    expect(await repos.users.getByEmail('sv01@uni.edu')).toBeNull();
  });
});

describe('setting a password', () => {
  async function seededUser(providers: string[] = ['password']) {
    auth.seed({
      uid: 'user-1',
      email: 'sv01@uni.edu',
      displayName: 'A',
      providers,
      password: 'old-password',
    });
    await repos.users.upsert({
      uid: 'user-1',
      email: 'sv01@uni.edu',
      displayName: 'A',
      role: 'STUDENT',
    });
  }

  it('changes the password', async () => {
    await seededUser();

    const result = await service.setPassword({
      uid: 'user-1',
      password: 'brand-new-password',
      byUid: ADMIN_UID,
    });

    expect(result.ok).toBe(true);
    expect(auth.passwordOf('user-1')).toBe('brand-new-password');
  });

  it('records who set it and when, but never the password', async () => {
    await seededUser();
    await service.setPassword({ uid: 'user-1', password: 'brand-new-password', byUid: ADMIN_UID });

    const doc = await repos.users.get('user-1');
    expect(doc?.passwordSetBy).toBe(ADMIN_UID);
    expect(doc?.passwordSetAt).toBeGreaterThan(0);
    expect(JSON.stringify(doc)).not.toContain('brand-new-password');
  });

  it('refuses a Google-only account until the admin confirms', async () => {
    await seededUser(['google.com']);

    const first = await service.setPassword({
      uid: 'user-1',
      password: 'brand-new-password',
      byUid: ADMIN_UID,
    });

    expect(first).toEqual({ ok: false, error: 'accountUsesGoogle' });
    expect(auth.passwordOf('user-1')).toBeUndefined();
  });

  it('goes ahead once confirmed, leaving both ways in', async () => {
    await seededUser(['google.com']);

    const result = await service.setPassword({
      uid: 'user-1',
      password: 'brand-new-password',
      byUid: ADMIN_UID,
      confirmNoPassword: true,
    });

    expect(result.ok).toBe(true);
    const account = await auth.getAccount('user-1');
    expect(account?.providers).toEqual(['google.com', 'password']);
  });

  it('refuses an account that does not exist', async () => {
    expect(
      await service.setPassword({ uid: 'nobody', password: 'brand-new-password', byUid: ADMIN_UID }),
    ).toEqual({ ok: false, error: 'memberNotFound' });
  });

  it('records nothing when the provider refuses the password', async () => {
    await seededUser();

    await service.setPassword({ uid: 'user-1', password: 'short', byUid: ADMIN_UID });

    expect(auth.passwordOf('user-1')).toBe('old-password');
    expect((await repos.users.get('user-1'))?.passwordSetAt).toBeUndefined();
  });
});

describe('a reset link the admin can pass on', () => {
  it('issues one for a known user', async () => {
    const created = await create();
    const uid = (created as { data: { uid: string } }).data.uid;

    const result = await service.resetLink(uid);

    expect(result.ok).toBe(true);
    expect((result as { data: { link: string } }).data.link).toContain('resetPassword');
    expect(auth.issuedLinks()).toHaveLength(1);
  });

  it('never reveals the password, only a link', async () => {
    const created = await create({ password: 'correct-horse' });
    const uid = (created as { data: { uid: string } }).data.uid;

    const result = await service.resetLink(uid);

    expect(JSON.stringify(result)).not.toContain('correct-horse');
  });

  it('refuses an unknown user', async () => {
    expect(await service.resetLink('nobody')).toEqual({ ok: false, error: 'memberNotFound' });
  });
});
