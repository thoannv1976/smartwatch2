import type { TenureReview } from '@/domain/simulation';
import { interpolate, type Dictionary, type Locale } from '@/i18n';
import { Card, CardTitle } from '@/components/ui/primitives';
import { formatDecimal, formatPercentagePoints } from '@/lib/format';
import { withAreaLabel } from '@/lib/area-label';

/**
 * The six-quarter verdict on the final report.
 *
 * The headline comes from the final score, so it can never contradict the
 * grade; the three axes below it explain how that score was earned. Everything
 * is rule-based and reproducible — see `advice.ts`.
 */
export function TenureReviewCard({
  t,
  locale,
  review,
}: {
  t: Dictionary;
  locale: Locale;
  review: TenureReview;
}) {
  return (
    <Card className="border-brand-600/40">
      <CardTitle hint={t.tenure.subtitle}>{t.tenure.title}</CardTitle>

      <p className="max-w-prose text-sm leading-relaxed text-ink-100">
        {t.tenureVerdict[review.verdict]}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Axis
          label={t.tenure.consistency}
          value={t.consistencyLabel[review.consistency]}
          description={t.consistencyDesc[review.consistency]}
          detail={interpolate(t.tenure.swing, {
            value: formatDecimal(review.consistencySwing, locale, 1),
          })}
        />
        <Axis
          label={t.tenure.adaptation}
          value={t.adaptationLabel[review.adaptation]}
          description={t.adaptationDesc[review.adaptation]}
          detail={interpolate(t.tenure.overlap, {
            value: Math.round(review.adaptationOverlap * 100),
          })}
        />
        <Axis
          label={t.tenure.trajectory}
          value={t.trajectoryLabel[review.trajectory]}
          description={interpolate(t.trajectoryDesc[review.trajectory], {
            worstQuarter: review.worstQuarter,
          })}
          detail={`${t.tenure.shareChange}: ${formatPercentagePoints(review.shareChange, locale)}`}
        />
      </div>

      <dl className="tnum mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-ink-400">
        <div>
          <dt className="inline">{t.tenure.bestQuarter}: </dt>
          <dd className="inline font-semibold text-good-400">
            {t.common.quarterShort}
            {review.bestQuarter}
          </dd>
        </div>
        <div>
          <dt className="inline">{t.tenure.worstQuarter}: </dt>
          <dd className="inline font-semibold text-bad-400">
            {t.common.quarterShort}
            {review.worstQuarter}
          </dd>
        </div>
      </dl>

      <h3 className="mt-6 text-xs font-semibold tracking-wide text-ink-200 uppercase">
        {t.tenure.quarterByQuarter}
      </h3>
      <ol className="mt-3 flex flex-col gap-3">
        {review.quarterNotes.map(({ quarter, note }) => (
          <li key={quarter} className="flex gap-3">
            <span className="tnum mt-0.5 flex h-6 w-10 shrink-0 items-center justify-center rounded-md bg-ink-800 text-xs font-bold text-ink-300">
              {t.common.quarterShort}
              {quarter}
            </span>
            <p className="text-sm leading-relaxed text-ink-300">
              {interpolate(t.review[note.key], withAreaLabel(t, note.values))}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Axis({
  label,
  value,
  description,
  detail,
}: {
  label: string;
  value: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-4">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-ink-100">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-400">{description}</p>
      <p className="tnum mt-2 text-xs text-ink-500">{detail}</p>
    </div>
  );
}
