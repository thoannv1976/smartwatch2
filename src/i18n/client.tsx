'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, getDictionary, type Dictionary, type Locale } from './index';

type I18nValue = { locale: Locale; t: Dictionary };

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: getDictionary(DEFAULT_LOCALE),
});

/**
 * Provides the dictionary to client components. The locale is resolved on the
 * server (from the cookie) and passed down, so there is no flash of the wrong
 * language and no client-side locale detection.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, t: getDictionary(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
