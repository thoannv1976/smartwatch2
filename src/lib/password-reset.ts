/**
 * The outcome of asking for a password reset from the login page.
 *
 * `SENT` is returned for an address that has no account, exactly as for one
 * that does. That is the whole point: without it, anyone could type addresses
 * into the login page and learn which ones belong to students and staff at this
 * institution. The only outcomes a visitor can tell apart are "we tried" and
 * "something went wrong at our end".
 */
export type ResetRequestOutcome = 'SENT' | 'INVALID_EMAIL' | 'FAILED';

/** Firebase codes that mean "no account", which must NOT be distinguishable. */
const NO_ACCOUNT_CODES = new Set(['auth/user-not-found', 'auth/invalid-recipient-email']);

/** Codes that mean the address itself is unusable, which is safe to say. */
const BAD_EMAIL_CODES = new Set(['auth/invalid-email', 'auth/missing-email']);

/**
 * Maps a client-SDK failure onto what the visitor is allowed to learn.
 *
 * Kept apart from the component so it can be tested without React, Firebase or
 * a browser — and so the rule above is stated in one place rather than inside a
 * catch block where the next edit could quietly widen it.
 */
export function classifyResetFailure(error: unknown): ResetRequestOutcome {
  const raw = (error as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw : '';

  if (NO_ACCOUNT_CODES.has(code)) return 'SENT';
  if (BAD_EMAIL_CODES.has(code)) return 'INVALID_EMAIL';
  return 'FAILED';
}
