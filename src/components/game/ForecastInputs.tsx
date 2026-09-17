'use client';

import { FORECAST_NOTE_MAX, type QuarterForecast } from '@/domain/simulation';
import { useI18n } from '@/i18n/client';
import { Card, CardTitle } from '@/components/ui/primitives';

/**
 * The commitment block: what do you think will happen, and why?
 *
 * WHY ONLY THE RANK IS REQUIRED. Every field added here is a tax on a
 * student's patience, charged six times per game. Two numbers and a sentence,
 * demanded every quarter, is how you get a class that resents the form and
 * types "asdf" into it — at which point the data is worse than none, because it
 * looks real. One tap out of six buttons is the cheapest thing that can buy a
 * genuine committed judgement, so that is the only thing made compulsory. The
 * expected share and the reason are there for the students who want to think
 * harder, and cost nothing to skip.
 *
 * WHY NOTHING IS PRE-FILLED. A default — last quarter's rank, say — would be
 * accepted unread by most of the class, and an unread default measures the
 * software, not the student. An empty control that must be touched is the
 * entire mechanism.
 *
 * The prediction never reaches the engine and never changes a score. It is
 * feedback, and `forecast.ts` says why that is deliberate.
 */
export function ForecastInputs({
  value,
  onChange,
  companyCount,
  disabled = false,
}: {
  value: QuarterForecast | null;
  onChange: (next: QuarterForecast) => void;
  companyCount: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const ranks = Array.from({ length: companyCount }, (_, i) => i + 1);

  const sharePercent =
    typeof value?.predictedShare === 'number' ? Math.round(value.predictedShare * 1000) / 10 : '';

  const setRank = (predictedRank: number) =>
    onChange({
      predictedRank,
      predictedShare: value?.predictedShare ?? null,
      note: value?.note ?? null,
    });

  const setShare = (raw: string) => {
    if (!value) return;
    const percent = Number(raw);
    const predictedShare =
      raw.trim() === '' || !Number.isFinite(percent)
        ? null
        : Math.min(100, Math.max(0, percent)) / 100;
    onChange({ ...value, predictedShare });
  };

  return (
    <Card>
      <CardTitle hint={t.forecast.hint}>{t.forecast.title}</CardTitle>

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-sm text-ink-200">{t.forecast.rankQuestion}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.forecast.rankQuestion}>
          {ranks.map((rank) => {
            const selected = value?.predictedRank === rank;
            return (
              <button
                key={rank}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRank(rank)}
                disabled={disabled}
                className={`tnum h-11 w-11 rounded-lg border text-base font-bold transition disabled:opacity-50 ${
                  selected
                    ? 'border-brand-500 bg-brand-500 text-ink-950'
                    : 'border-ink-600 bg-ink-900/50 text-ink-200 hover:border-ink-500 hover:bg-ink-800'
                }`}
              >
                {rank}
              </button>
            );
          })}
        </div>
        {value === null ? (
          <p className="text-xs text-warn-500">{t.forecast.rankRequired}</p>
        ) : null}
      </fieldset>

      {/* Both optional, and shown only once a rank is chosen: asking for the
          detail before the commitment puts the work in the wrong order. */}
      {value ? (
        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-ink-200">
            <span>
              {t.forecast.shareQuestion}{' '}
              <span className="text-xs text-ink-500">{t.forecast.optional}</span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                inputMode="decimal"
                value={sharePercent}
                onChange={(e) => setShare(e.target.value)}
                disabled={disabled}
                className="tnum w-28 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-sm text-ink-400">%</span>
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-ink-200">
            <span>
              {t.forecast.noteQuestion}{' '}
              <span className="text-xs text-ink-500">{t.forecast.optional}</span>
            </span>
            <textarea
              rows={2}
              maxLength={FORECAST_NOTE_MAX}
              value={value.note ?? ''}
              placeholder={t.forecast.notePlaceholder}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              disabled={disabled}
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none disabled:opacity-50"
            />
            <span className="tnum self-end text-xs text-ink-500">
              {(value.note ?? '').length}/{FORECAST_NOTE_MAX}
            </span>
          </label>
        </div>
      ) : null}
    </Card>
  );
}
