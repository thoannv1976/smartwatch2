'use client';

import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from '@/i18n';
import { useI18n } from '@/i18n/client';

/**
 * Language switcher. Writes a cookie and refreshes, so the server re-renders in
 * the chosen language — no client-side translation loading, no flash of the
 * wrong locale.
 */
export function LocaleSwitcher() {
  const { locale } = useI18n();
  const router = useRouter();

  const choose = (next: Locale) => {
    if (next === locale) return;
    // One year; the locale is a preference, not sensitive data.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900 p-0.5 text-xs">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-current={code === locale}
          className={`rounded-md px-2.5 py-1 transition ${
            code === locale
              ? 'bg-ink-700 font-semibold text-ink-100'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          {LOCALE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
