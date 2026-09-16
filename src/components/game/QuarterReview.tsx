import type { ReviewNote, ReviewTone } from '@/domain/simulation';
import { interpolate, type Dictionary } from '@/i18n';
import { withAreaLabel } from '@/lib/area-label';
import { Card, CardTitle } from '@/components/ui/primitives';

/**
 * The rule-based review of one played quarter, shown under the competitor
 * intelligence on the result screen.
 *
 * A plain presentational component that takes the dictionary as a prop rather
 * than reading it from a hook, so the same markup renders inside a server
 * component (the result page) and inside the final report.
 */

const TONE_STYLE: Record<ReviewTone, { dot: string; text: string }> = {
  bad: { dot: 'bg-bad-500', text: 'text-ink-200' },
  warn: { dot: 'bg-warn-500', text: 'text-ink-300' },
  good: { dot: 'bg-good-500', text: 'text-ink-300' },
};

export function ReviewNoteList({ t, notes }: { t: Dictionary; notes: ReviewNote[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {notes.map((note) => {
        const tone = TONE_STYLE[note.tone];
        return (
          <li key={note.key} className="flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
            <span className={`text-sm leading-relaxed ${tone.text}`}>
              {interpolate(t.review[note.key], withAreaLabel(t, note.values))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function QuarterReviewCard({ t, notes }: { t: Dictionary; notes: ReviewNote[] }) {
  if (notes.length === 0) return null;

  return (
    <Card>
      <CardTitle hint={t.review.hint}>{t.review.title}</CardTitle>
      <ReviewNoteList t={t} notes={notes} />
    </Card>
  );
}
