'use client';

import { useMemo, useState } from 'react';
import {
  runSandbox,
  type CompanyState,
  type GameConfig,
  type PositionPoint,
  type QuarterDecision,
  type RivalNote,
} from '@/domain/simulation';
import { useI18n } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { seriesColor } from '@/components/charts/series';
import { Card, CardTitle, InfoNote, WarningNote } from '@/components/ui/primitives';
import { formatMoney, formatMoneyCompact, formatPercent, formatScore } from '@/lib/format';

/**
 * The three tools that stand in for the Golden Strategy in group mode.
 *
 * Reading the field, seeing where it is crowded, and trying an allocation
 * against a neutral bench. Together they answer the question a student
 * actually has — "what should I do?" — without pretending to know what five
 * classmates are about to do.
 */

export function RivalNotes({ notes }: { notes: RivalNote[] }) {
  const { t } = useI18n();
  if (notes.length === 0) return null;

  return (
    <Card>
      <CardTitle hint={t.rivals.hint}>{t.rivals.title}</CardTitle>
      <ul className="flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.key} className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info-500" aria-hidden />
            <span className="text-sm leading-relaxed text-ink-300">
              {interpolate(t.rivals[note.key], note.values)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Six companies on price against satisfaction.
 *
 * A plain table rather than a scatter plot: at six points the numbers are more
 * legible than a chart, they read correctly on a phone, and they carry to a
 * printout and a screen reader without any extra work.
 */
export function PositioningMap({ points }: { points: PositionPoint[] }) {
  const { t, locale } = useI18n();
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.price - b.price);

  return (
    <Card>
      <CardTitle hint={t.rivals.mapHint}>{t.rivals.mapTitle}</CardTitle>
      <ul className="flex flex-col gap-2">
        {sorted.map((point) => (
          <li
            key={point.seatKey}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${
              point.isYou ? 'border-brand-600/50 bg-brand-500/10' : 'border-ink-700/60'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: seriesColor(point.seatKey) }}
              />
              <span
                className={`truncate text-sm ${point.isYou ? 'font-bold text-ink-100' : 'text-ink-200'}`}
              >
                {point.companyName}
              </span>
              {point.isBot ? (
                <span className="rounded-full border border-ink-600 px-1.5 py-0.5 text-[10px] text-ink-400">
                  {t.group.botBadge}
                </span>
              ) : null}
            </span>
            <span className="tnum flex gap-4 text-xs text-ink-400">
              <span>
                {t.rivals.mapPrice} {formatMoney(point.price, locale)}
              </span>
              <span>
                {t.rivals.mapCsat} {formatScore(point.customerSatisfaction, locale)}
              </span>
              <span>
                {t.rivals.mapShare} {formatPercent(point.marketShare, locale)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The practice bench.
 *
 * Runs in the BROWSER, on every change: `runSandbox` is pure and two
 * `simulateQuarter` calls cost about 0.05 ms, so there is no server round trip
 * and nothing to rate-limit. That is only safe because the bench takes no
 * classmate data at all — see `sandbox.ts`. The disclaimer is not decoration:
 * a student who mistook this for a forecast would draw the wrong conclusion
 * from it.
 */
export function SandboxPanel({
  playerState,
  decision,
  quarter,
  seed,
  config,
}: {
  playerState: CompanyState;
  decision: QuarterDecision;
  quarter: number;
  seed: string;
  config: GameConfig;
}) {
  const { t, locale } = useI18n();
  const [shown, setShown] = useState(false);

  const result = useMemo(
    () => (shown ? runSandbox({ playerState, decision, quarter, seed, config }) : null),
    [shown, playerState, decision, quarter, seed, config],
  );

  return (
    <Card>
      <CardTitle hint={t.sandbox.hint}>{t.sandbox.title}</CardTitle>

      {result ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Figure
              label={t.sandbox.neutral}
              share={formatPercent(result.neutral.marketShare, locale)}
              profit={formatMoneyCompact(result.neutral.netProfit, locale)}
              rank={result.neutral.rank}
            />
            <Figure
              emphasis
              label={t.sandbox.yours}
              share={formatPercent(result.yours.marketShare, locale)}
              profit={formatMoneyCompact(result.yours.netProfit, locale)}
              rank={result.yours.rank}
            />
          </div>

          <p className="tnum text-xs text-ink-400">
            {t.sandbox.difference}:{' '}
            {formatMoneyCompact(result.yours.netProfit - result.neutral.netProfit, locale)}
            {result.yours.unfulfilledUnits > result.neutral.unfulfilledUnits ? (
              <span className="ml-3 text-warn-500">
                {t.result.unfulfilledDemand}:{' '}
                {Math.round(result.yours.unfulfilledUnits).toLocaleString(locale)}
              </span>
            ) : null}
          </p>

          <WarningNote>{t.sandbox.disclaimer}</WarningNote>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShown(true)}
            className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700"
          >
            {t.sandbox.run}
          </button>
          <div className="mt-3">
            <InfoNote>{t.sandbox.disclaimer}</InfoNote>
          </div>
        </>
      )}
    </Card>
  );
}

function Figure({
  label,
  share,
  profit,
  rank,
  emphasis = false,
}: {
  label: string;
  share: string;
  profit: string;
  rank: number;
  emphasis?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasis ? 'border-brand-600/50 bg-brand-500/10' : 'border-ink-700/60 bg-ink-900/50'
      }`}
    >
      <p className="text-xs text-ink-400">{label}</p>
      <p className="tnum mt-1 text-lg font-semibold text-ink-100">{profit}</p>
      <p className="tnum mt-1 text-xs text-ink-500">
        {t.kpi.marketShare} {share} · {t.kpi.rank} {rank}/6
      </p>
    </div>
  );
}
