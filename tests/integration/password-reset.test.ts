import { describe, expect, it } from 'vitest';
import { classifyResetFailure } from '@/lib/password-reset';

/**
 * "Forgot password" must not turn the login page into a directory.
 *
 * Firebase distinguishes "no such account" from every other failure. If that
 * distinction reaches the screen, anyone can type addresses in and learn which
 * ones belong to people at this institution.
 */
describe('a reset request never reveals whether an account exists', () => {
  it('reports success when there is no such account', () => {
    expect(classifyResetFailure({ code: 'auth/user-not-found' })).toBe('SENT');
  });

  it('reports success for an address Firebase will not deliver to', () => {
    expect(classifyResetFailure({ code: 'auth/invalid-recipient-email' })).toBe('SENT');
  });

  it('is allowed to say the address itself is malformed', () => {
    // This reveals nothing about who has an account — only about what was typed.
    expect(classifyResetFailure({ code: 'auth/invalid-email' })).toBe('INVALID_EMAIL');
    expect(classifyResetFailure({ code: 'auth/missing-email' })).toBe('INVALID_EMAIL');
  });

  it('reports a genuine failure as a failure', () => {
    expect(classifyResetFailure({ code: 'auth/network-request-failed' })).toBe('FAILED');
    expect(classifyResetFailure({ code: 'auth/too-many-requests' })).toBe('FAILED');
  });

  it('treats an error with no code as a failure, not as success', () => {
    // Guessing "sent" here would hide a real outage behind a reassuring message.
    expect(classifyResetFailure(new Error('boom'))).toBe('FAILED');
    expect(classifyResetFailure(null)).toBe('FAILED');
    expect(classifyResetFailure(undefined)).toBe('FAILED');
  });
});
