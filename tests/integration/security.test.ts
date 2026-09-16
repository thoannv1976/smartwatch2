import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/safe-next-path';
import { patchKeepsWindowValid } from '@/server/instructor/validation';

/**
 * Small guards whose failure modes are quiet and whose blast radius is not.
 */
describe('?next= after sign-in stays inside the app', () => {
  it('keeps ordinary internal paths', () => {
    expect(safeNextPath('/home')).toBe('/home');
    expect(safeNextPath('/game/abc123/decision')).toBe('/game/abc123/decision');
    expect(safeNextPath('/leaderboard/a1?sort=finalScore')).toBe('/leaderboard/a1?sort=finalScore');
  });

  it('falls back to /home when there is nothing usable', () => {
    expect(safeNextPath(null)).toBe('/home');
    expect(safeNextPath('')).toBe('/home');
  });

  it.each([
    'https://evil.example/phish',
    'http://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'evil.example',
  ])('refuses %j', (hostile) => {
    // A student handed such a link signs in for real and lands off-site, which
    // is exactly what makes the page after it convincing.
    expect(safeNextPath(hostile)).toBe('/home');
  });
});

describe('editing an assignment cannot make it unstartable', () => {
  const current = { startAt: 1_000, deadline: 2_000 };

  it('accepts an edit that keeps the deadline after the start', () => {
    expect(patchKeepsWindowValid(current, { deadline: 3_000 })).toBe(true);
    expect(patchKeepsWindowValid(current, { startAt: 1_500 })).toBe(true);
    expect(patchKeepsWindowValid(current, { startAt: 5_000, deadline: 9_000 })).toBe(true);
  });

  it('rejects a lone deadline moved before the EXISTING start', () => {
    // The patch carries no startAt, so checking it alone would see nothing
    // wrong — this is the case the create-time check never had to handle.
    expect(patchKeepsWindowValid(current, { deadline: 500 })).toBe(false);
  });

  it('rejects a lone start moved after the EXISTING deadline', () => {
    expect(patchKeepsWindowValid(current, { startAt: 9_000 })).toBe(false);
  });

  it('rejects a zero-length window', () => {
    expect(patchKeepsWindowValid(current, { deadline: 1_000 })).toBe(false);
  });

  it('leaves an edit that touches neither timestamp alone', () => {
    expect(patchKeepsWindowValid(current, {})).toBe(true);
  });
});
