import { describe, expect, it } from 'vitest';
import {
  APP_COOKIE,
  LEGACY_LOCALE_COOKIE,
  LEGACY_SESSION_COOKIE,
  decodeAppCookie,
  encodeAppCookie,
  readAppCookie,
  writeAppCookie,
} from '@/lib/app-cookie';

const store = (values: Record<string, string>) => ({
  get: (name: string) => (name in values ? { value: values[name]! } : undefined),
});

const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl-_';

describe('app cookie (Firebase Hosting forwards only __session)', () => {
  it('uses the one name Firebase Hosting forwards', () => {
    expect(APP_COOKIE).toBe('__session');
  });

  it('round-trips session and locale', () => {
    const encoded = encodeAppCookie({ session: JWT, locale: 'en' });
    expect(decodeAppCookie(encoded)).toEqual({ session: JWT, locale: 'en' });
  });

  it('round-trips an empty state', () => {
    expect(decodeAppCookie(encodeAppCookie({ session: null, locale: null }))).toEqual({
      session: null,
      locale: null,
    });
  });

  it('rejects malformed values and unknown locales', () => {
    expect(decodeAppCookie('garbage')).toBeNull();
    expect(decodeAppCookie('v2~en~x')).toBeNull();
    expect(decodeAppCookie(undefined)).toBeNull();
    expect(decodeAppCookie('v1~fr~-')).toEqual({ session: null, locale: null });
  });

  it('still reads the legacy cookies so existing sign-ins survive', () => {
    expect(readAppCookie(store({ [LEGACY_SESSION_COOKIE]: JWT, [LEGACY_LOCALE_COOKIE]: 'en' }))).toEqual({
      session: JWT,
      locale: 'en',
    });
  });

  it('prefers the app cookie over the legacy ones', () => {
    const s = store({
      [APP_COOKIE]: encodeAppCookie({ session: 'new.jwt.value', locale: 'vi' }),
      [LEGACY_SESSION_COOKIE]: JWT,
      [LEGACY_LOCALE_COOKIE]: 'en',
    });
    expect(readAppCookie(s)).toEqual({ session: 'new.jwt.value', locale: 'vi' });
  });

  it('a signed-out app cookie never falls back to a stale legacy session', () => {
    const s = store({
      [APP_COOKIE]: encodeAppCookie({ session: null, locale: 'vi' }),
      [LEGACY_SESSION_COOKIE]: JWT,
    });
    expect(readAppCookie(s).session).toBeNull();
  });

  it('signing out keeps the language', () => {
    const s = store({ [APP_COOKIE]: encodeAppCookie({ session: JWT, locale: 'en' }) });
    expect(readAppCookie(s).locale).toBe('en');
    const written: Record<string, string> = {};
    writeAppCookie({ set: (n, v) => (written[n] = v) }, { session: null, locale: 'en' });
    expect(decodeAppCookie(written[APP_COOKIE])).toEqual({ session: null, locale: 'en' });
    // The legacy cookies are cleared, never written with a value.
    expect(written[LEGACY_SESSION_COOKIE]).toBe('');
    expect(written[LEGACY_LOCALE_COOKIE]).toBe('');
  });

  it('writes an httpOnly cookie', () => {
    const options: unknown[] = [];
    writeAppCookie({ set: (_n, _v, o) => options.push(o) }, { session: JWT, locale: 'vi' });
    expect(options[0]).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax' });
  });
});
