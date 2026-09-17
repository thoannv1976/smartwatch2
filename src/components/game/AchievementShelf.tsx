import { ALL_ACHIEVEMENTS, type Achievement, type AchievementTier } from '@/domain/simulation';
import type { Dictionary, Locale } from '@/i18n';
import { interpolate } from '@/i18n';
import { Card, CardTitle, InfoNote } from '@/components/ui/primitives';
import { formatMoneyCompact } from '@/lib/format';

/**
 * What the student earned, beside what they did not.
 *
 * SHOWING THE LOCKED ONES IS THE POINT. A shelf of only the badges you won
 * tells you nothing about what else was possible; the greyed-out ones are a
 * list of things worth trying next time, written as goals rather than as
 * criticism. Their descriptions are shown too — a locked badge with a hidden
 * condition is a puzzle, and this is a course, not a puzzle.
 */

const TIER_RING: Record<AchievementTier, string> = {
  gold: 'border-warn-500/50 bg-warn-500/10',
  silver: 'border-ink-400/40 bg-ink-500/10',
  bronze: 'border-brand-600/40 bg-brand-500/10',
};

/** Money-shaped values in the descriptions, formatted before interpolation. */
const MONEY_KEYS = ['profit', 'cash'] as const;

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

export function AchievementShelf({
  t,
  locale,
  earned,
}: {
  t: Dictionary;
  locale: Locale;
  earned: Achievement[];
}) {
  const earnedKeys = new Set(earned.map((a) => a.key));
  const locked = ALL_ACHIEVEMENTS.filter((key) => !earnedKeys.has(key));

  return (
    <Card>
      <CardTitle
        hint={t.achievements.hint}
        right={
          <span className="tnum shrink-0 text-xs text-ink-400">
            {interpolate(t.achievements.earnedCount, {
              earned: earned.length,
              total: ALL_ACHIEVEMENTS.length,
            })}
          </span>
        }
      >
        {t.achievements.title}
      </CardTitle>

      {earned.length === 0 ? (
        <InfoNote>{t.achievements.none}</InfoNote>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {earned.map((achievement) => (
            <li
              key={achievement.key}
              className={`rounded-lg border p-4 ${TIER_RING[achievement.tier]}`}
            >
              <p className="text-sm font-bold text-ink-100">
                {t.achievementName[achievement.key]}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-300">
                {interpolate(
                  t.achievementDesc[achievement.key],
                  withMoney(achievement.values, locale),
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {locked.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t.achievements.lockedTitle}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {locked.map((key) => (
              <li
                key={key}
                className="rounded-lg border border-ink-700/50 bg-ink-900/40 px-3 py-2 opacity-60"
              >
                <p className="text-xs font-semibold text-ink-300">{t.achievementName[key]}</p>
                {/* Description shown even when locked: a hidden condition is a
                    puzzle, and a locked badge should read as a goal. The values
                    are the student's own, so the sentence still makes sense. */}
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                  {stripValues(t.achievementDesc[key])}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A locked badge has no values to interpolate, so the placeholders are removed
 * rather than printed raw. `interpolate` deliberately leaves unknown tokens
 * intact — correct for its own job, wrong here, where `{from}` on screen would
 * look like a bug.
 */
function stripValues(template: string): string {
  return template
    .replace(/\s*\{[a-zA-Z]+\}/g, ' …')
    .replace(/\s+/g, ' ')
    .trim();
}
