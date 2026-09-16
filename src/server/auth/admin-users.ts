import 'server-only';
import { getAdminAuth } from '@/db/firestore';

/**
 * Firebase Authentication admin operations, behind a port.
 *
 * WHY A PORT. Every other write path in this app is testable because it goes
 * through a repository interface with an in-memory twin. The Admin SDK has no
 * such twin: it needs real credentials and a real project. Calling
 * `getAdminAuth()` straight from a server action would leave the riskiest code
 * in the codebase — creating accounts and setting other people's passwords —
 * with no test at all. So the operations live behind `AuthAdmin`, with a fake
 * that the tests drive, exactly as `Repositories` already does for Firestore.
 *
 * Outcomes are returned, not thrown. A thrown Admin SDK error carries the whole
 * request, and this module handles passwords: an error that reaches a log line
 * must never be able to take one with it. Nothing here logs, and nothing here
 * puts a password into a returned value.
 */

/** What the app needs to know about an account, without its secrets. */
export interface AuthAccount {
  uid: string;
  email: string;
  displayName: string;
  /** Sign-in methods, e.g. `password`, `google.com`. */
  providers: string[];
  /** False for a Google-only account: there is no password to replace. */
  hasPassword: boolean;
}

export type CreateAccountOutcome =
  | { status: 'CREATED'; uid: string }
  /** The address is taken. The uid comes back so the caller can adopt it. */
  | { status: 'EMAIL_EXISTS'; uid: string }
  | { status: 'WEAK_PASSWORD' }
  | { status: 'INVALID_EMAIL' };

export type SetPasswordOutcome =
  | { status: 'OK' }
  | { status: 'WEAK_PASSWORD' }
  | { status: 'NOT_FOUND' };

export interface AuthAdmin {
  createAccount(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<CreateAccountOutcome>;

  getAccount(uid: string): Promise<AuthAccount | null>;

  setPassword(uid: string, password: string): Promise<SetPasswordOutcome>;

  /**
   * A single-use link that lets the person set their own password.
   *
   * Returns null when no account has that address. The caller decides what to
   * reveal — this module does not assume the answer is safe to show.
   */
  passwordResetLink(email: string): Promise<string | null>;
}

/** Firebase error codes this module reacts to, rather than error messages. */
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

class FirebaseAuthAdmin implements AuthAdmin {
  async createAccount(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<CreateAccountOutcome> {
    const auth = getAdminAuth();
    const email = input.email.trim().toLowerCase();

    try {
      const created = await auth.createUser({
        email,
        password: input.password,
        displayName: input.displayName.trim() || email.split('@')[0] || email,
      });
      return { status: 'CREATED', uid: created.uid };
    } catch (error) {
      const code = codeOf(error);

      if (code === 'auth/email-already-exists') {
        // Hand back the existing uid so the caller can attach a Firestore user
        // document to an Auth account that lost one, instead of dead-ending.
        const existing = await auth.getUserByEmail(email).catch(() => null);
        if (existing) return { status: 'EMAIL_EXISTS', uid: existing.uid };
        return { status: 'INVALID_EMAIL' };
      }
      if (code === 'auth/invalid-password') return { status: 'WEAK_PASSWORD' };
      if (code === 'auth/invalid-email') return { status: 'INVALID_EMAIL' };
      throw error;
    }
  }

  async getAccount(uid: string): Promise<AuthAccount | null> {
    try {
      const record = await getAdminAuth().getUser(uid);
      const providers = record.providerData.map((p) => p.providerId);
      return {
        uid: record.uid,
        email: record.email ?? '',
        displayName: record.displayName ?? '',
        providers,
        hasPassword: providers.includes('password'),
      };
    } catch (error) {
      if (codeOf(error) === 'auth/user-not-found') return null;
      throw error;
    }
  }

  async setPassword(uid: string, password: string): Promise<SetPasswordOutcome> {
    try {
      await getAdminAuth().updateUser(uid, { password });
      return { status: 'OK' };
    } catch (error) {
      const code = codeOf(error);
      if (code === 'auth/invalid-password') return { status: 'WEAK_PASSWORD' };
      if (code === 'auth/user-not-found') return { status: 'NOT_FOUND' };
      throw error;
    }
  }

  async passwordResetLink(email: string): Promise<string | null> {
    try {
      return await getAdminAuth().generatePasswordResetLink(email.trim().toLowerCase());
    } catch (error) {
      const code = codeOf(error);
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return null;
      throw error;
    }
  }
}

let cached: AuthAdmin | null = null;

export function getAuthAdmin(): AuthAdmin {
  cached ??= new FirebaseAuthAdmin();
  return cached;
}
