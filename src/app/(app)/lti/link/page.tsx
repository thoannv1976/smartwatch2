import { requireRolePage } from '@/server/auth/guards';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { ErrorNote, PageHeader } from '@/components/ui/primitives';
import { LtiLinkChoices } from '@/components/lti/LtiLinkChoices';
import { LtiError } from '@/server/lti/service';
import { getLtiService, isLtiEnabled } from '@/server/lti/runtime';
import { assignmentSeating } from '@/db/models';

export const metadata = { title: 'Moodle — Smartwatch CEO Challenge' };

/** First instructor launch of an unlinked LMS activity: choose its assignment. */
export default async function LtiLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key = '' } = await searchParams;
  const user = await requireRolePage('INSTRUCTOR', `/lti/link?key=${encodeURIComponent(key)}`);
  const { t } = await getTranslations();

  if (!isLtiEnabled()) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ErrorNote>{t.lti.errors.notConfigured}</ErrorNote>
      </main>
    );
  }

  const service = getLtiService();
  let pending;
  try {
    pending = await service.pendingFor(key, user);
  } catch (error) {
    const code = error instanceof LtiError ? error.code : 'generic';
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader title={t.lti.linkTitle} />
        <ErrorNote>{t.lti.errors[code]}</ErrorNote>
      </main>
    );
  }

  const linkable = await service.linkableAssignments(user);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.lti.linkTitle}
        subtitle={interpolate(t.lti.linkIntro, {
          activity: pending.resourceTitle ?? '—',
          course: pending.contextTitle ?? pending.contextLabel ?? '—',
        })}
      />
      <LtiLinkChoices
        linkKey={key}
        assignments={linkable.map(({ assignment, course }) => ({
          id: assignment.id,
          title: assignment.title,
          courseName: course.courseName,
          semester: course.semester,
          groupKind:
            assignment.mode !== 'GROUP'
              ? undefined
              : assignmentSeating(assignment) === 'AUTO'
                ? 'INDUSTRY'
                : 'TEAM',
        }))}
      />
    </main>
  );
}
