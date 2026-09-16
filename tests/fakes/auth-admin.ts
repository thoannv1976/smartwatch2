import type {
  AuthAccount,
  AuthAdmin,
  CreateAccountOutcome,
  SetPasswordOutcome,
} from '@/server/auth/admin-users';

/**
 * In-memory AuthAdmin, with the same refusals the Firebase one returns.
 *
 * Passwords are held only so a test can assert one actually changed. Nothing
 * here mirrors production storage — Firebase never gives a password back.
 */
export class FakeAuthAdmin implements AuthAdmin {
  private readonly accounts = new Map<string, AuthAccount>();
  private readonly passwords = new Map<string, string>();
  private readonly links: string[] = [];
  private nextId = 1;

  /** Firebase's own minimum. The app asks for more; the port must not assume it. */
  static readonly MIN_PASSWORD = 6;

  /** Seeds an account that already exists, e.g. one created via Google. */
  seed(account: Omit<AuthAccount, 'hasPassword'> & { password?: string }): AuthAccount {
    const stored: AuthAccount = {
      uid: account.uid,
      email: account.email.toLowerCase(),
      displayName: account.displayName,
      providers: account.providers,
      hasPassword: account.providers.includes('password'),
    };
    this.accounts.set(stored.uid, stored);
    // A password is only kept when the account actually has the password
    // provider. Storing one for a Google-only account would let a test set up a
    // state Firebase cannot produce, and then assert against it.
    if (account.password && stored.hasPassword) this.passwords.set(stored.uid, account.password);
    return stored;
  }

  /** Test-only: the password currently set, or undefined. */
  passwordOf(uid: string): string | undefined {
    return this.passwords.get(uid);
  }

  /** Test-only: every reset link handed out, newest last. */
  issuedLinks(): readonly string[] {
    return this.links;
  }

  private byEmail(email: string): AuthAccount | null {
    const needle = email.trim().toLowerCase();
    for (const account of this.accounts.values()) {
      if (account.email === needle) return account;
    }
    return null;
  }

  async createAccount(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<CreateAccountOutcome> {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@')) return { status: 'INVALID_EMAIL' };

    const existing = this.byEmail(email);
    if (existing) return { status: 'EMAIL_EXISTS', uid: existing.uid };
    if (input.password.length < FakeAuthAdmin.MIN_PASSWORD) return { status: 'WEAK_PASSWORD' };

    const uid = `auth-uid-${this.nextId++}`;
    this.seed({
      uid,
      email,
      displayName: input.displayName.trim() || email.split('@')[0] || email,
      providers: ['password'],
      password: input.password,
    });
    return { status: 'CREATED', uid };
  }

  async getAccount(uid: string): Promise<AuthAccount | null> {
    return this.accounts.get(uid) ?? null;
  }

  async setPassword(uid: string, password: string): Promise<SetPasswordOutcome> {
    const account = this.accounts.get(uid);
    if (!account) return { status: 'NOT_FOUND' };
    if (password.length < FakeAuthAdmin.MIN_PASSWORD) return { status: 'WEAK_PASSWORD' };

    this.passwords.set(uid, password);
    // Setting a password on a Google-only account adds the provider, as
    // Firebase does — that is what gives the person a second way in.
    if (!account.providers.includes('password')) {
      this.accounts.set(uid, {
        ...account,
        providers: [...account.providers, 'password'],
        hasPassword: true,
      });
    }
    return { status: 'OK' };
  }

  async passwordResetLink(email: string): Promise<string | null> {
    const account = this.byEmail(email);
    if (!account) return null;
    const link = `https://example.test/__/auth/action?mode=resetPassword&uid=${account.uid}`;
    this.links.push(link);
    return link;
  }
}
