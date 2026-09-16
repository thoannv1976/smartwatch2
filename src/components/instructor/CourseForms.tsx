'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  OFFICIAL_SEED_EXAMPLE,
  SCENARIO_VERSION,
  SELECTABLE_SCENARIO_VERSIONS,
} from '@/domain/simulation';
import {
  addCourseMemberAction,
  createAssignmentAction,
  createCourseAction,
  setAssignmentArchivedAction,
  setCourseArchivedAction,
  setCourseMemberRemovedAction,
  updateAssignmentAction,
  updateCourseAction,
  updateCourseMemberAction,
} from '@/server/instructor/actions';
import { useI18n } from '@/i18n/client';
import { Card, CardTitle, ErrorNote, InfoNote, WarningNote } from '@/components/ui/primitives';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { toDateTimeInputValue } from '@/lib/format';

/** Course creation, student enrolment and assignment setup (spec 9.3, 9.4). */

function useActionState() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return { error, setError, done, setDone, pending, startTransition };
}

export function CreateCourseForm() {
  const { t } = useI18n();
  const router = useRouter();
  const { error, setError, pending, startTransition } = useActionState();
  const [courseName, setCourseName] = useState('');
  const [semester, setSemester] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCourseAction({ courseName, semester });
      if (result.ok) {
        setCourseName('');
        setSemester('');
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <Card>
      <CardTitle>{t.instructor.createCourse}</CardTitle>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label={t.instructor.courseName} value={courseName} onChange={setCourseName} />
        <Field label={t.instructor.semester} value={semester} onChange={setSemester} width="w-32" />
        <button
          type="submit"
          disabled={pending || !courseName.trim() || !semester.trim()}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
        >
          {t.common.create}
        </button>
      </form>
      {error ? <div className="mt-3">{<ErrorNote>{error}</ErrorNote>}</div> : null}
    </Card>
  );
}

export function AddMemberForm({ courseId }: { courseId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { error, setError, done, setDone, pending, startTransition } = useActionState();
  const [email, setEmail] = useState('');
  const [studentCode, setStudentCode] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await addCourseMemberAction({ courseId, email, studentCode });
      if (result.ok) {
        setEmail('');
        setStudentCode('');
        setDone(t.instructor.memberAdded);
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <Field label={t.instructor.memberEmail} value={email} onChange={setEmail} type="email" />
      <Field
        label={t.instructor.studentCode}
        value={studentCode}
        onChange={setStudentCode}
        width="w-32"
      />
      <button
        type="submit"
        disabled={pending || !email.trim() || !studentCode.trim()}
        className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:bg-ink-700 disabled:opacity-50"
      >
        {t.instructor.addMember}
      </button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {done ? <span className="text-xs text-good-400">{done}</span> : null}
    </form>
  );
}

export function CreateAssignmentForm({ courseId }: { courseId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { error, setError, pending, startTransition } = useActionState();

  const now = Date.now();
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(toDateTimeInputValue(now));
  const [deadline, setDeadline] = useState(toDateTimeInputValue(now + 7 * 86_400_000));
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [scenarioVersion, setScenarioVersion] = useState<string>(SCENARIO_VERSION);
  const [officialSeed, setOfficialSeed] = useState(OFFICIAL_SEED_EXAMPLE);
  const [isOpen, setIsOpen] = useState(true);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAssignmentAction({
        courseId,
        title,
        startAt: new Date(startAt).getTime(),
        deadline: new Date(deadline).getTime(),
        maxAttempts,
        scenarioVersion,
        officialSeed,
        isOpen,
      });
      if (result.ok) {
        setTitle('');
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <Card>
      <CardTitle hint={t.instructor.seedHint}>{t.instructor.newAssignment}</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.instructor.assignmentTitle} value={title} onChange={setTitle} width="w-64" />
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.instructor.startAt}
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.instructor.deadline}
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.instructor.maxAttempts}
            <input
              type="number"
              min={1}
              max={10}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="tnum w-20 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.instructor.scenarioVersion}
            <select
              value={scenarioVersion}
              onChange={(e) => setScenarioVersion(e.target.value)}
              className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
            >
              {SELECTABLE_SCENARIO_VERSIONS.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <Field
            label={t.instructor.officialSeed}
            value={officialSeed}
            onChange={setOfficialSeed}
            width="w-56"
            mono
          />
          <label className="flex items-center gap-2 pb-2 text-xs text-ink-300">
            <input
              type="checkbox"
              checked={isOpen}
              onChange={(e) => setIsOpen(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand-500)]"
            />
            {t.instructor.isOpen}
          </label>
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
          >
            {t.common.create}
          </button>
        </div>

        <InfoNote>{t.leaderboard.subtitle}</InfoNote>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </form>
    </Card>
  );
}

/** Toggles an assignment open or closed without touching scenario, engine or seed. */
export function AssignmentToggle({
  assignmentId,
  isOpen,
}: {
  assignmentId: string;
  isOpen: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return <ErrorNote>{error}</ErrorNote>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // The result used to be discarded, so a refused toggle looked like a
          // successful one that simply did not take.
          const result = await updateAssignmentAction({ assignmentId, isOpen: !isOpen });
          if (!result.ok) {
            setError(t.errors[result.error]);
            return;
          }
          router.refresh();
        })
      }
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        isOpen
          ? 'border-good-500/40 bg-good-500/10 text-good-400 hover:bg-good-500/20'
          : 'border-ink-600 bg-ink-800 text-ink-300 hover:bg-ink-700'
      }`}
    >
      {isOpen ? t.instructor.isOpen : t.home.officialClosed}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  width = 'w-48',
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  width?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-300">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  );
}

/** Rename a course, move its semester, and open or close self-enrolment. */
export function EditCourseForm({
  courseId,
  courseName,
  semester,
  enrollmentOpen,
  archived,
}: {
  courseId: string;
  courseName: string;
  semester: string;
  enrollmentOpen: boolean;
  archived: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { error, setError, done, setDone, pending, startTransition } = useActionState();
  const [name, setName] = useState(courseName);
  const [term, setTerm] = useState(semester);

  const run = (
    action: () => Promise<{ ok: true } | { ok: false; error: keyof typeof t.errors | 'invalidInput' }>,
  ) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setDone(t.common.save);
        router.refresh();
      } else {
        setError(t.errors[result.error as keyof typeof t.errors]);
      }
    });
  };

  return (
    <Card>
      <CardTitle
        hint={t.instructorAdmin.enrollmentOpenHint}
        right={
          <ConfirmButton
            label={archived ? t.instructorAdmin.restore : t.instructorAdmin.archive}
            confirmLabel={t.common.confirm}
            cancelLabel={t.common.cancel}
            tone={archived ? 'neutral' : 'warn'}
            disabled={pending}
            onConfirm={() => run(() => setCourseArchivedAction({ courseId, archived: !archived }))}
          />
        }
      >
        {t.common.edit}
      </CardTitle>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => updateCourseAction({ courseId, courseName: name, semester: term }));
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label={t.instructor.courseName} value={name} onChange={setName} width="w-64" />
        <Field label={t.instructor.semester} value={term} onChange={setTerm} width="w-32" />
        <button
          type="submit"
          disabled={pending || !name.trim() || !term.trim()}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
        >
          {t.common.save}
        </button>
      </form>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink-200">
        <input
          id={`enrollment-open-${courseId}`}
          type="checkbox"
          checked={enrollmentOpen}
          disabled={pending}
          onChange={(e) => run(() => updateCourseAction({ courseId, enrollmentOpen: e.target.checked }))}
          className="h-4 w-4 accent-[var(--color-brand-500)]"
        />
        {t.instructorAdmin.enrollmentOpen}
      </label>

      {archived ? (
        <div className="mt-3">
          <WarningNote>{t.instructorAdmin.archivedNote}</WarningNote>
        </div>
      ) : null}
      {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
      {done ? <p className="mt-3 text-xs text-good-400">{done}</p> : null}
    </Card>
  );
}

/** Corrects a student code, and removes or restores a roster row. */
export function MemberRowActions({
  courseId,
  uid,
  studentCode,
  removed,
}: {
  courseId: string;
  uid: string;
  studentCode: string;
  removed: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { error, setError, pending, startTransition } = useActionState();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(studentCode);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateCourseMemberAction({ courseId, uid, studentCode: code });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-2">
          <input
            id={`student-code-edit-${uid}`}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={40}
            className="w-36 rounded-md border border-ink-600 bg-ink-950 px-2 py-1 font-mono text-xs text-ink-100"
          />
          <button
            type="submit"
            disabled={pending || !code.trim()}
            className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-ink-950 disabled:opacity-50"
          >
            {t.common.save}
          </button>
          <button
            type="button"
            onClick={() => {
              setCode(studentCode);
              setEditing(false);
              setError(null);
            }}
            className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-300"
          >
            {t.common.cancel}
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 text-xs text-ink-200 transition hover:bg-ink-700"
          >
            {t.common.edit}
          </button>
          <ConfirmButton
            label={removed ? t.instructorAdmin.restore : t.instructorAdmin.removeStudent}
            confirmLabel={t.common.confirm}
            cancelLabel={t.common.cancel}
            tone={removed ? 'neutral' : 'warn'}
            disabled={pending}
            onConfirm={() =>
              startTransition(async () => {
                const result = await setCourseMemberRemovedAction({
                  courseId,
                  uid,
                  removed: !removed,
                });
                if (result.ok) router.refresh();
                else setError(t.errors[result.error]);
              })
            }
          />
        </div>
      )}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

/** Archives or restores an assignment. Grades and the leaderboard are untouched. */
export function AssignmentArchiveButton({
  assignmentId,
  archived,
}: {
  assignmentId: string;
  archived: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <ConfirmButton
      label={archived ? t.instructorAdmin.restore : t.instructorAdmin.archive}
      confirmLabel={t.common.confirm}
      cancelLabel={t.common.cancel}
      tone={archived ? 'neutral' : 'warn'}
      disabled={pending}
      onConfirm={() =>
        startTransition(async () => {
          const result = await setAssignmentArchivedAction({
            assignmentId,
            archived: !archived,
          });
          if (result.ok) router.refresh();
          else setError(t.errors[result.error]);
        })
      }
    />
  );
}
