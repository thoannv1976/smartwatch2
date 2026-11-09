'use client';

import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n';
import { useI18n } from '@/i18n/client';

/**
 * Language switcher. Asks the server to store the choice (in the app cookie,
 * see src/lib/app-cookie.ts) and refreshes, so the server re-renders in the
 * chosen language — no client-side translation loading, no flash of the wrong
 * locale.
 */
export function LocaleSwitcher() {
  const { locale } = useI18n();
  const router = useRouter();

  const choose = async (next: Locale) => {
    if (next === locale) return;
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    });
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
          className={`rounded-md px-2.5 py-1 font-semibold transition ${
            code === locale
              ? 'bg-ink-850 font-semibold text-brand-400 shadow-sm'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          {LOCALE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
