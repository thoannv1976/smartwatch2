'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Sparkles, Users } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { Badge, Card, CardTitle, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { linkExistingAssignmentAction, linkNewAssignmentAction } from '@/server/lti/actions';

export interface LinkableAssignment {
  id: string;
  title: string;
  courseName: string;
  semester: string;
  /** GROUP assignments only: INDUSTRY = students seated automatically, TEAM = join code. */
  groupKind?: 'INDUSTRY' | 'TEAM';
}

/** The two ways an instructor can link an LMS activity: a new assignment, or one they have. */
export function LtiLinkChoices({ linkKey, assignments }: { linkKey: string; assignments: LinkableAssignment[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => ReturnType<typeof linkNewAssignmentAction>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.replace(`/instructor/assignments/${result.data.assignmentId}`);
      else setError(t.lti.errors[result.error]);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card className="border-brand-100 bg-brand-50">
        <CardTitle hint={t.lti.linkNewDesc}>{t.lti.linkNewTitle}</CardTitle>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => linkNewAssignmentAction({ key: linkKey }))}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-400 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {pending ? t.lti.linking : t.lti.linkNewButton}
        </button>
      </Card>

      <Card>
        <CardTitle hint={t.lti.linkNewGroupDesc}>{t.lti.linkNewGroupTitle}</CardTitle>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => linkNewAssignmentAction({ key: linkKey, mode: 'GROUP' }))}
          className="flex items-center gap-2 rounded-lg border border-brand-500 bg-ink-850 px-5 py-2.5 text-sm font-semibold text-brand-500 shadow-sm transition hover:bg-brand-50 disabled:opacity-50"
        >
          <Users className="h-4 w-4" aria-hidden />
          {pending ? t.lti.linking : t.lti.linkNewGroupButton}
        </button>
      </Card>

      <Card>
        <CardTitle>{t.lti.linkExistingTitle}</CardTitle>
        {assignments.length === 0 ? (
          <EmptyState>{t.lti.linkExistingNone}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-100">
                    {a.title}{' '}
                    {a.groupKind ? (
                      <Badge tone="brand">
                        {a.groupKind === 'INDUSTRY' ? t.lti.groupBadge : t.lti.teamBadge}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink-400">
                    {a.courseName} · {a.semester}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => linkExistingAssignmentAction({ key: linkKey, assignmentId: a.id }))}
                  className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-sm font-semibold text-ink-100 shadow-sm transition hover:bg-ink-900 disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                  {t.lti.linkExistingButton}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
