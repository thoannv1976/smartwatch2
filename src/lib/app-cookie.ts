/**
 * The app's one cookie.
 *
 * WHY ONE COOKIE, AND WHY THIS NAME. When the app is served through Firebase
 * Hosting (for example at <project>.web.app), Hosting forwards exactly one
 * cookie to Cloud Run — the one named `__session` — and strips every other.
 * The sign-in session and the language preference therefore travel together
 * in `__session`.
 *
 * Format: `v1~<locale or ->~<Firebase session cookie or ->`. A Firebase session
 * cookie is a JWT (base64url and dots), so it never contains `~`.
 *
 * The cookie is httpOnly and written only by the server; the browser never
 * needs to read it. The old separate `session` and `locale` cookies are still
 * READ, so someone already signed in at the Cloud Run address stays signed in;
 * they are never written again.
 */
import { isLocale, type Locale } from '@/i18n';

export const APP_COOKIE = '__session';
export const LEGACY_SESSION_COOKIE = 'session';
export const LEGACY_LOCALE_COOKIE = 'locale';

/** One year. The session inside expires on its own (verified server-side). */
export const APP_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface AppCookieState {
  session: string | null;
  locale: Locale | null;
}

const PREFIX = 'v1';
const EMPTY = '-';

export function encodeAppCookie(state: AppCookieState): string {
  return [PREFIX, state.locale ?? EMPTY, state.session || EMPTY].join('~');
}

export function decodeAppCookie(value: string | undefined | null): AppCookieState | null {
  if (!value) return null;
  const parts = value.split('~');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, locale, session] = parts;
  return {
    locale: isLocale(locale) ? locale : null,
    session: session && session !== EMPTY ? session : null,
  };
}

/** Minimal view of a cookie store (Next's `cookies()` or a request's `cookies`). */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** Reads the current state, falling back to the legacy cookies for any missing part. */
export function readAppCookie(store: CookieReader): AppCookieState {
  const current = decodeAppCookie(store.get(APP_COOKIE)?.value);
  const legacyLocale = store.get(LEGACY_LOCALE_COOKIE)?.value;
  return {
    // Once the app cookie exists it is authoritative for the session: a signed-out
    // app cookie must not fall back to a stale legacy session cookie.
    session: current ? current.session : (store.get(LEGACY_SESSION_COOKIE)?.value ?? null),
    locale: current?.locale ?? (isLocale(legacyLocale) ? legacyLocale : null),
  };
}

/** Cookie attributes shared by every write. */
export function appCookieOptions(maxAge = APP_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/** Minimal view of a response cookie jar. */
export interface CookieWriter {
  set(name: string, value: string, options: ReturnType<typeof appCookieOptions>): unknown;
}

/** Writes the new state and retires the legacy cookies (their values are carried over). */
export function writeAppCookie(jar: CookieWriter, state: AppCookieState): void {
  jar.set(APP_COOKIE, encodeAppCookie(state), appCookieOptions());
  jar.set(LEGACY_SESSION_COOKIE, '', appCookieOptions(0));
  jar.set(LEGACY_LOCALE_COOKIE, '', appCookieOptions(0));
}
