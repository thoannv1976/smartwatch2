import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, getDictionary, type Locale } from './index';
import { readAppCookie } from '@/lib/app-cookie';

/** Reads the locale chosen by the visitor (stored in the app cookie by POST /api/locale). */
export async function getLocale(): Promise<Locale> {
  return readAppCookie(await cookies()).locale ?? DEFAULT_LOCALE;
}

/** Convenience helper for server components: returns the locale and its dictionary. */
export async function getTranslations() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
