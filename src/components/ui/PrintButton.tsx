'use client';

import { useI18n } from '@/i18n/client';

/**
 * Opens the browser's print dialog, from which a student can save a PDF.
 *
 * Its own file because `'use client'` only does anything at the top of a file —
 * writing it inside a function body in a server component silently does
 * nothing, which this codebase has already been caught by once.
 *
 * Carries `no-print` so the button itself never appears on the printed page.
 */
export function PrintButton({ className = '' }: { className?: string }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`no-print rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700 ${className}`}
    >
      {t.printing.print}
    </button>
  );
}
