import { vi, type Dictionary } from './vi';
import { en } from './en';

export type Locale = 'vi' | 'en';

export const LOCALES: readonly Locale[] = ['vi', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'vi';
export const LOCALE_COOKIE = 'locale';

export const LOCALE_LABELS: Record<Locale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};

const dictionaries: Record<Locale, Dictionary> = { vi, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * Replaces `{placeholder}` tokens in a dictionary string.
 * Used by the rule-based lesson and competitor-intelligence templates.
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export type { Dictionary };
