'use client';

import {
  INVESTMENT_FIELDS,
  type QuarterDecision,
  type StrategySuggestion,
} from '@/domain/simulation';
import { useI18n } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { withAreaLabel } from '@/lib/area-label';
import { Card, CardTitle } from '@/components/ui/primitives';

/**
 * Strategy suggestions for a group match, and an explanation of what is
 * missing from them.
 *
 * THE GOLDEN STRATEGY IS NOT HERE, AND THE SCREEN SAYS SO. In solo play that
 * button brute-forces the best decision for a quarter, which it can only do
 * because the five rivals are rule-based and their decisions are already
 * determined by the seed. In a group the five rivals are people, and their
 * decisions DO NOT EXIST while the student is deciding — there is no
 * computation to run.
 *
 * Quietly dropping the button would leave students who played solo first
 * wondering where it went and assuming a bug. Saying plainly that the answer
 * is unknowable, and why, is itself the lesson: competitive strategy under
 * uncertainty is not an optimisation problem with a hidden answer key.
 */
export function GroupSuggestions({
  suggestions,
  onApply,
  disabled,
}: {
  suggestions: StrategySuggestion[];
  onApply: (decision: QuarterDecision) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle hint={t.coach.subtitle}>{t.coach.title}</CardTitle>

        <div className="grid gap-3 sm:grid-cols-3">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.key}
              className="flex flex-col justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/50 p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-ink-100">
                  {t.coachTitle[suggestion.key]}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">
                  {interpolate(t.coachWhy[suggestion.key], withAreaLabel(t, suggestion.values))}
                </p>
                <p className="tnum mt-3 text-xs text-ink-500">
                  {INVESTMENT_FIELDS.map((field) => suggestion.decision[field]).join(' · ')} ·{' '}
                  {suggestion.decision.priceIndex}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onApply(suggestion.decision)}
                disabled={disabled}
                className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-400 transition hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.coach.apply}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-500">{t.coach.heuristicNote}</p>
      </Card>

      <Card className="border-ink-600">
        <CardTitle>{t.group.goldenOffTitle}</CardTitle>
        <p className="max-w-prose text-sm leading-relaxed text-ink-300">{t.group.goldenOffWhy}</p>
      </Card>
    </div>
  );
}
