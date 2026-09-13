import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, getDictionary, isLocale, type Locale } from './index';

/** Reads the locale chosen by the visitor from the cookie set by the language switcher. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Convenience helper for server components: returns the locale and its dictionary. */
export async function getTranslations() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
