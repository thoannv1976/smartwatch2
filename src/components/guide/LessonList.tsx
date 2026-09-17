import type { Dictionary } from '@/i18n';
import { Card, CardTitle, InfoNote } from '@/components/ui/primitives';

/**
 * A part's lessons: the questions always, the answers only once earned.
 *
 * The questions carry real weight on their own — they tell a student what to
 * pay attention to while playing, which is most of the value and none of the
 * spoiler. The answers are held back because a list that says "distribution is
 * the bottleneck" IS the answer, and a student who reads it first never gets to
 * walk into the wall themselves.
 *
 * A locked section still SHOWS ITS QUESTIONS and says plainly what unlocks it.
 * A hidden section would look like a bug; a section that says "seven more
 * lessons await" would be a tease. This one says what it is holding and why.
 *
 * Server component with `t` passed in, matching `QuarterReviewCard` and
 * `AchievementShelf`.
 */
export function LessonList({
  t,
  title,
  unlocked,
  lockedNote,
  questions,
  answers,
}: {
  t: Dictionary;
  title: string;
  unlocked: boolean;
  lockedNote: string;
  /** Question text keyed the same way as `answers` — enforced by a test. */
  questions: Record<string, string>;
  answers: Record<string, string>;
}) {
  const keys = Object.keys(questions);

  return (
    <Card>
      <CardTitle hint={t.guide.lessons.questionsHint}>{title}</CardTitle>

      <div className="mb-5">
        {unlocked ? (
          <InfoNote>{t.guide.lessons.unlockedNote}</InfoNote>
        ) : (
          <InfoNote>{lockedNote}</InfoNote>
        )}
      </div>

      <ol className="flex flex-col gap-5">
        {keys.map((key, index) => (
          <li key={key} className="border-l-2 border-ink-700 pl-4">
            <p className="flex gap-2 text-sm font-semibold text-ink-100">
              <span className="tnum shrink-0 text-ink-500">{index + 1}.</span>
              <span className="max-w-prose">{questions[key]}</span>
            </p>

            {unlocked ? (
              <div className="mt-2 pl-6">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-400">
                  {t.guide.lessons.answerLabel}
                </p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-300">
                  {answers[key]}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {unlocked ? null : (
        <p className="mt-5 max-w-prose text-xs leading-relaxed text-ink-500">
          {t.guide.lessons.whyLocked}
        </p>
      )}
    </Card>
  );
}
