import type { ForecastAccuracy, ForecastScore } from '@/domain/simulation';
import type { Dictionary } from '@/i18n';
import { interpolate } from '@/i18n';
import { Badge, Card, CardTitle, InfoNote, Td, Th, TableScroll } from '@/components/ui/primitives';
import { formatDecimal, formatPercent } from '@/lib/format';

/**
 * The other half of the prediction: being shown, afterwards, what you said.
 *
 * A prediction that is never played back is just a form. The value is entirely
 * in the confrontation — *you said fourth, you came second* — and in seeing
 * your own sentence of reasoning sitting next to the number it produced.
 *
 * Server components, because everything here is derived from stored data and
 * nothing is interactive. `t` is passed in, matching `QuarterReviewCard` and
 * `TenureReviewCard`.
 */

/** One quarter's prediction against its result, on the result page. */
export function ForecastReviewCard({ t, score }: { t: Dictionary; score: ForecastScore }) {
  const tone = score.rankGap === 0 ? 'good' : score.rankGap <= 1 ? 'info' : 'warn';

  return (
    <Card>
      <CardTitle hint={t.forecast.reviewHint}>{t.forecast.reviewTitle}</CardTitle>

      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 px-4 py-3">
          <p className="text-xs text-ink-400">{t.forecast.youSaid}</p>
          <p className="tnum mt-1 text-2xl font-bold text-ink-100">{score.predictedRank}</p>
        </div>
        <span aria-hidden className="text-xl text-ink-600">
          →
        </span>
        <div className="rounded-lg border border-brand-600/50 bg-brand-500/10 px-4 py-3">
          <p className="text-xs text-ink-400">{t.forecast.actual}</p>
          <p className="tnum mt-1 text-2xl font-bold text-ink-100">{score.actualRank}</p>
        </div>
        <Badge tone={tone}>{t.forecast[score.direction]}</Badge>
      </div>

      {score.predictedShare !== null ? (
        <p className="tnum mt-4 text-sm text-ink-300">
          {interpolate(t.forecast.shareLine, {
            predicted: formatPercent(score.predictedShare, 'vi'),
            actual: formatPercent(score.actualShare, 'vi'),
            gap: score.shareGapPoints ?? 0,
          })}
        </p>
      ) : null}

      {score.note ? (
        <figure className="mt-4 border-l-2 border-ink-600 pl-4">
          <figcaption className="text-xs text-ink-500">{t.forecast.yourReason}</figcaption>
          {/* The student's own words, rendered as text. React escapes it. */}
          <blockquote className="mt-1 max-w-prose text-sm italic leading-relaxed text-ink-200">
            {score.note}
          </blockquote>
        </figure>
      ) : null}
    </Card>
  );
}

/**
 * The six-quarter calibration summary, on the final report.
 *
 * Says plainly how many quarters the index is based on. A student who predicted
 * twice should not be told they read the market perfectly all year.
 */
export function ForecastAccuracyCard({
  t,
  accuracy,
  totalQuarters,
}: {
  t: Dictionary;
  accuracy: ForecastAccuracy;
  totalQuarters: number;
}) {
  return (
    <Card>
      <CardTitle hint={t.forecast.accuracyHint}>{t.forecast.accuracyTitle}</CardTitle>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="tnum text-4xl font-bold text-ink-100">
            {formatDecimal(accuracy.index, 'vi', 0)}
            <span className="ml-1 text-base font-normal text-ink-500">/100</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-brand-400">
            {t.forecastBand[accuracy.band]}
          </p>
        </div>
        <p className="max-w-prose text-sm text-ink-300">{t.forecastBandDesc[accuracy.band]}</p>
      </div>

      <p className="tnum mt-4 text-xs text-ink-400">
        {interpolate(t.forecast.basis, {
          predicted: accuracy.predicted,
          total: totalQuarters,
          exact: accuracy.exact,
          gap: formatDecimal(accuracy.averageRankGap, 'vi', 2),
        })}
      </p>

      {/* Intent beside outcome. This is the table an instructor prints to mark
          a student's reasoning rather than only their results. */}
      <div className="mt-5">
        <TableScroll>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th align="center">{t.common.quarter}</Th>
                <Th align="center">{t.forecast.youSaid}</Th>
                <Th align="center">{t.forecast.actual}</Th>
                <Th align="right">{t.forecast.shareColumn}</Th>
                <Th>{t.forecast.yourReason}</Th>
              </tr>
            </thead>
            <tbody>
              {accuracy.quarters.map((score) => (
                <tr key={score.quarter}>
                  <Td numeric align="center">
                    {t.common.quarterShort}
                    {score.quarter}
                  </Td>
                  <Td numeric align="center">
                    {score.predictedRank}
                  </Td>
                  <Td
                    numeric
                    align="center"
                    className={score.rankGap === 0 ? 'font-semibold text-good-400' : undefined}
                  >
                    {score.actualRank}
                  </Td>
                  <Td numeric align="right" className="text-ink-400">
                    {score.predictedShare === null
                      ? '—'
                      : `${formatPercent(score.predictedShare, 'vi')} → ${formatPercent(score.actualShare, 'vi')}`}
                  </Td>
                  <Td className="text-ink-300">
                    {score.note ? <span className="italic">{score.note}</span> : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {accuracy.predicted < totalQuarters ? (
        <div className="mt-4">
          <InfoNote>{t.forecast.partial}</InfoNote>
        </div>
      ) : null}
    </Card>
  );
}
