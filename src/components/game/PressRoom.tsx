import type { BoardLetter, CustomerVoice, PressHeadline, PressTone } from '@/domain/simulation';
import type { Dictionary, Locale } from '@/i18n';
import { interpolate } from '@/i18n';
import { Card, CardTitle } from '@/components/ui/primitives';
import { formatMoneyCompact } from '@/lib/format';

/**
 * The market as reporting, reviews and a letter from the people who own the
 * company.
 *
 * Server components: every word is derived from stored numbers, so there is
 * nothing to hydrate. `t` is passed in, matching `QuarterReviewCard`.
 *
 * Money values arrive as raw numbers from `press.ts` — the domain layer must
 * not know about locales — and are formatted here before interpolation.
 */

const DOT: Record<PressTone, string> = {
  good: 'bg-good-500',
  warn: 'bg-warn-500',
  bad: 'bg-bad-500',
  neutral: 'bg-ink-500',
};

/** Money keys the press strings interpolate. Formatted, not printed raw. */
const MONEY_KEYS = ['profit', 'loss', 'cumulativeProfit', 'price'] as const;

function withMoney(
  values: Record<string, string | number>,
  locale: Locale,
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...values };
  for (const key of MONEY_KEYS) {
    if (typeof out[key] === 'number') out[key] = formatMoneyCompact(out[key] as number, locale);
  }
  return out;
}

export function PressRoom({
  t,
  locale,
  headlines,
  voices,
}: {
  t: Dictionary;
  locale: Locale;
  headlines: PressHeadline[];
  voices: CustomerVoice[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {headlines.length > 0 ? (
        <Card>
          <CardTitle hint={t.press.hint}>{t.press.title}</CardTitle>
          <ul className="flex flex-col gap-3">
            {headlines.map((headline) => (
              <li key={headline.key} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[headline.tone]}`}
                />
                <span className="max-w-prose text-sm font-medium leading-relaxed text-ink-200">
                  {interpolate(t.press[headline.key], withMoney(headline.values, locale))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {voices.length > 0 ? (
        <Card>
          <CardTitle hint={t.voices.hint}>{t.voices.title}</CardTitle>
          <ul className="flex flex-col gap-3">
            {voices.map((voice) => (
              <li
                key={voice.key}
                className="rounded-lg border border-ink-700/60 bg-ink-900/50 px-4 py-3"
              >
                <Stars count={voice.stars} />
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-200">
                  {interpolate(t.voices[voice.key], withMoney(voice.values, locale))}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Five stars, with the count also written out.
 *
 * The glyphs alone are unreadable to a screen reader and invisible in a
 * black-and-white printout, which is how half these reports get read.
 */
function Stars({ count }: { count: number }) {
  return (
    <p className="text-sm" aria-label={`${count}/5`}>
      <span aria-hidden className="tracking-widest text-warn-500">
        {'★'.repeat(count)}
        <span className="text-ink-600">{'★'.repeat(5 - count)}</span>
      </span>
      <span className="ml-2 align-middle text-xs text-ink-500">{count}/5</span>
    </p>
  );
}

/**
 * The board's letter.
 *
 * Deliberately one paragraph and exactly one instruction. A letter carrying
 * five suggestions carries none, and a student reading a wall of criticism
 * after a bad quarter stops reading.
 */
export function BoardLetterCard({
  t,
  locale,
  letter,
}: {
  t: Dictionary;
  locale: Locale;
  letter: BoardLetter;
}) {
  const values = withMoney(letter.values, locale);

  return (
    <Card>
      <CardTitle hint={t.board.hint}>{t.board.title}</CardTitle>
      <blockquote
        className={`border-l-2 pl-4 ${
          letter.tone === 'good'
            ? 'border-good-500/60'
            : letter.tone === 'bad'
              ? 'border-bad-500/60'
              : letter.tone === 'warn'
                ? 'border-warn-500/60'
                : 'border-ink-600'
        }`}
      >
        <p className="max-w-prose text-sm leading-relaxed text-ink-200">
          {interpolate(t.board[letter.key], values)}
        </p>
        <p className="mt-3 max-w-prose text-sm font-medium leading-relaxed text-ink-100">
          {t.boardAdvice[letter.adviceKey]}
        </p>
        <footer className="mt-3 text-xs text-ink-500">— {t.board.signature}</footer>
      </blockquote>
    </Card>
  );
}
