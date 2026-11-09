import type { ReactNode } from 'react';
import { Megaphone } from 'lucide-react';

/** The quarter's market event, shown as a coloured banner so it is read before deciding. */
export function EventBanner({
  eyebrow,
  title,
  description,
  footnote,
  action,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  footnote?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-night-900 via-night-800 to-brand-500 p-5 text-white shadow-lg shadow-brand-500/20 sm:p-6">
      <div
        aria-hidden
        className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-violet-400/30 blur-3xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Megaphone className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-indigo-200 uppercase">{eyebrow}</p>
            <h2 className="mt-0.5 text-lg font-extrabold sm:text-xl">{title}</h2>
            <p className="mt-1.5 max-w-prose text-sm text-indigo-100">{description}</p>
            {footnote ? <p className="tnum mt-2 text-xs text-indigo-200">{footnote}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </section>
  );
}

/** White call-to-action button for use on the dark banner. */
export const bannerButtonClass =
  'flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-500 shadow-md transition hover:bg-indigo-50';
