'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/i18n';
import type { EnrolledCourse, JoinableCourse } from '@/server/game/enrollment';
import { joinCourseAction, leaveCourseAction } from '@/server/game/actions';
import { useI18n } from '@/i18n/client';
import { Badge, Card, CardTitle, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { formatDateOnly } from '@/lib/format';

/** The two panels of the join screen: classes you are in, and classes you can join. */

export function EnrolledCourses({
  courses,
  locale,
}: {
  courses: EnrolledCourse[];
  locale: Locale;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardTitle>{t.enroll.myCourses}</CardTitle>
      {courses.length === 0 ? (
        <EmptyState>{t.enroll.noCourses}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((row) => (
            <li
              key={row.course.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/50 p-4"
            >
              <div>
                <p className="font-semibold text-ink-100">
                  {row.course.courseName}{' '}
                  {row.archived ? <Badge tone="warn">{t.enroll.archivedCourse}</Badge> : null}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {row.course.semester} · {t.instructor.studentCode}:{' '}
                  <span className="font-mono">{row.studentCode}</span> ·{' '}
                  {formatDateOnly(row.joinedAt, locale)}
                </p>
              </div>
              <LeaveButton courseId={row.course.id} canLeave={row.canLeave} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LeaveButton({ courseId, canLeave }: { courseId: string; canLeave: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canLeave) {
    return <span className="max-w-xs text-xs text-ink-500">{t.enroll.leaveHint}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {armed ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await leaveCourseAction({ courseId });
                  if (result.ok) {
                    setArmed(false);
                    router.refresh();
                  } else {
                    setError(t.errors[result.error]);
                  }
                })
              }
              className="rounded-md border border-warn-500/40 bg-warn-500/10 px-3 py-1.5 text-xs font-semibold text-warn-500 transition hover:bg-warn-500/20 disabled:opacity-50"
            >
              {t.common.confirm}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800"
            >
              {t.common.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setArmed(true);
            }}
            className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-ink-200 transition hover:bg-ink-700"
          >
            {t.enroll.leave}
          </button>
        )}
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

export function JoinableCourses({ courses }: { courses: JoinableCourse[] }) {
  const { t } = useI18n();

  return (
    <Card>
      <CardTitle hint={t.enroll.studentCodeHint}>{t.enroll.available}</CardTitle>
      {courses.length === 0 ? (
        <EmptyState>{t.enroll.noneOpen}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((row) => (
            <JoinRow key={row.course.id} row={row} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function JoinRow({ row }: { row: JoinableCourse }) {
  const { t } = useI18n();
  const router = useRouter();
  const [studentCode, setStudentCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await joinCourseAction({ courseId: row.course.id, studentCode });
      if (result.ok) {
        setStudentCode('');
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <li className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink-100">{row.course.courseName}</p>
        {row.alreadyMember ? <Badge tone="good">{t.enroll.myCourses}</Badge> : null}
      </div>
      <p className="mt-0.5 text-xs text-ink-400">
        {row.course.semester}
        {row.instructorName ? ` · ${t.enroll.instructor}: ${row.instructorName}` : ''}
      </p>

      {row.alreadyMember ? null : (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.enroll.studentCodeLabel}
            <input
              id={`student-code-${row.course.id}`}
              type="text"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              placeholder={t.enroll.studentCodePlaceholder}
              maxLength={40}
              className="w-56 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !studentCode.trim()}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
          >
            {pending ? t.enroll.joining : t.enroll.join}
          </button>
        </form>
      )}

      {error ? (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </li>
  );
}
