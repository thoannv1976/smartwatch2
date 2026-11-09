import { Check } from 'lucide-react';

/**
 * Q1…Qn progress: finished quarters are ticked, the quarter being decided is
 * highlighted, the rest are greyed out.
 */
export function QuarterStepper({
  total,
  completed,
  label,
}: {
  total: number;
  /** Number of quarters already simulated. */
  completed: number;
  label: string;
}) {
  const current = Math.min(completed + 1, total);
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 px-4 py-3 shadow-sm shadow-slate-200/70">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-wide text-ink-400 uppercase">{label}</span>
        <span className="tnum text-xs font-semibold text-ink-400">
          {Math.min(completed, total)}/{total}
        </span>
      </div>
      <ol className="mt-2.5 flex items-center">
        {Array.from({ length: total }, (_, i) => {
          const q = i + 1;
          const done = q <= completed;
          const isCurrent = !done && q === current;
          return (
            <li key={q} className="flex flex-1 items-center last:flex-none">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                  done
                    ? 'bg-good-500 text-white'
                    : isCurrent
                      ? 'bg-brand-500 text-white ring-4 ring-brand-100'
                      : 'border border-ink-600 bg-ink-850 text-ink-400'
                }`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : `Q${q}`}
              </span>
              {q < total ? (
                <span
                  aria-hidden
                  className={`mx-1 h-1 flex-1 rounded-full ${q <= completed ? 'bg-good-500' : 'bg-ink-700'}`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
