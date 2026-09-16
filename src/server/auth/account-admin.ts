import 'server-only';
import type { Role } from '@/db/models';
import type { Repositories } from '@/db/repositories/types';
import type { GameErrorKey } from '@/server/game/errors';
import type { AuthAdmin } from './admin-users';

/**
 * Creating accounts and setting passwords, as plain orchestration.
 *
 * Separate from the server actions so it can be tested: an action calls
 * `requireRole`, which reads cookies, and nothing that reads cookies runs in a
 * unit test. The action is left as a thin authorisation wrapper and everything
 * that can actually be wrong lives here, driven by `Repositories` and the
 * `AuthAdmin` port — both of which have in-memory twins.
 *
 * NOTHING in this file logs. It is handed plaintext passwords, and a log line
 * is the easiest place for one to escape to.
 */

export type AccountResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GameErrorKey | 'invalidInput' };

export class AccountAdminService {
  constructor(
    private readonly repos: Repositories,
    private readonly auth: AuthAdmin,
  ) {}

  /**
   * Creates a sign-in account and its user document together.
   *
   * The document is written now rather than at first sign-in so the person
   * appears in the admin list straight away with the role they were given. The
   * sign-in route reads `existing?.role ?? resolveInitialRole(...)`, so that
   * stored role then wins and the two mechanisms agree.
   */
  async createAccount(input: {
    email: string;
    displayName: string;
    role: Role;
    password: string;
  }): Promise<AccountResult<{ uid: string; adopted: boolean }>> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();

    const outcome = await this.auth.createAccount({
      email,
      password: input.password,
      displayName,
    });

    if (outcome.status === 'WEAK_PASSWORD') return { ok: false, error: 'weakPassword' };
    if (outcome.status === 'INVALID_EMAIL') return { ok: false, error: 'invalidInput' };

    const adopted = outcome.status === 'EMAIL_EXISTS';
    if (adopted) {
      // A sign-in account exists. With a user document too there is nothing to
      // do and the admin should edit that row. Without one — an account whose
      // document was lost — adopt it, rather than leaving the only route to
      // repair it closed.
      const existing = await this.repos.users.get(outcome.uid);
      if (existing) return { ok: false, error: 'emailAlreadyExists' };
    }

    await this.repos.users.upsert({ uid: outcome.uid, email, displayName, role: input.role });
    // Creating the account directly makes any pending invite meaningless.
    await this.repos.roleInvites.remove(email);

    return { ok: true, data: { uid: outcome.uid, adopted } };
  }

  /**
   * Sets a password for an account.
   *
   * Sign-in providers are read here, on demand, rather than for every row of
   * the user list — that would be one Admin SDK call per user on every page
   * load. A Google-only account is refused the first time so the UI can say
   * what setting a password will do; the admin re-submits with
   * `confirmNoPassword` to go ahead.
   */
  async setPassword(input: {
    uid: string;
    password: string;
    byUid: string;
    confirmNoPassword?: boolean;
  }): Promise<AccountResult<Record<string, never>>> {
    const account = await this.auth.getAccount(input.uid);
    if (!account) return { ok: false, error: 'memberNotFound' };

    if (!account.hasPassword && input.confirmNoPassword !== true) {
      return { ok: false, error: 'accountUsesGoogle' };
    }

    const outcome = await this.auth.setPassword(input.uid, input.password);
    if (outcome.status === 'WEAK_PASSWORD') return { ok: false, error: 'weakPassword' };
    if (outcome.status === 'NOT_FOUND') return { ok: false, error: 'memberNotFound' };

    // An admin who sets a password can sign in as that person, including as
    // another admin. The power cannot be designed away while admins hold it, so
    // it is at least recorded. The password itself is never stored.
    await this.repos.users.recordPasswordSet(input.uid, Date.now(), input.byUid);

    return { ok: true, data: {} };
  }

  /**
   * A single-use link the admin passes on, so they never learn the password.
   *
   * Addressed by uid and admin-only, so unlike the login page's own reset this
   * cannot be used to probe which addresses exist.
   */
  async resetLink(uid: string): Promise<AccountResult<{ link: string }>> {
    const user = await this.repos.users.get(uid);
    if (!user) return { ok: false, error: 'memberNotFound' };

    const link = await this.auth.passwordResetLink(user.email);
    if (!link) return { ok: false, error: 'memberNotFound' };

    return { ok: true, data: { link } };
  }
}

export function createAccountAdminService(
  repos: Repositories,
  auth: AuthAdmin,
): AccountAdminService {
  return new AccountAdminService(repos, auth);
}
