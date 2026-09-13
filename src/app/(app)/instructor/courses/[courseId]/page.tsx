import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRolePage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { hasRole } from '@/server/auth/session';
import { getTranslations } from '@/i18n/server';
import { AddMemberForm, CreateAssignmentForm } from '@/components/instructor/CourseForms';
import {
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatDateOnly } from '@/lib/format';

export const metadata = { title: 'Lớp học — Smartwatch CEO Challenge' };

/** Course detail: roster and assignment creation. */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireRolePage('INSTRUCTOR', `/instructor/courses/${courseId}`);
  const { t, locale } = await getTranslations();

  const repos = getRepositories();
  const course = await repos.courses.get(courseId);
  if (!course) notFound();

  // An instructor only sees their own courses; an admin sees all.
  if (!hasRole(user.role, 'ADMIN') && course.instructorId !== user.uid) notFound();

  const [members, assignments] = await Promise.all([
    repos.courses.listMembers(courseId),
    repos.assignments.listByCourse(courseId),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={course.courseName}
        subtitle={course.semester}
        right={
          <Link
            href="/instructor"
            className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-ink-100 transition hover:bg-ink-700"
          >
            {t.instructor.title}
          </Link>
        }
      />

      <Card>
        <CardTitle hint={t.instructor.memberNotFound}>
          {t.instructor.members} ({members.length})
        </CardTitle>
        <AddMemberForm courseId={courseId} />

        <div className="mt-4">
          {members.length === 0 ? (
            <EmptyState>{t.common.none}</EmptyState>
          ) : (
            <TableScroll>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>{t.instructor.studentCode}</Th>
                    <Th>{t.common.student}</Th>
                    <Th>{t.auth.email}</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.uid}>
                      <Td className="font-mono text-xs">{member.studentCode}</Td>
                      <Td className="text-ink-100">{member.displayName}</Td>
                      <Td className="text-ink-400">{member.email}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </div>
      </Card>

      <CreateAssignmentForm courseId={courseId} />

      <Card>
        <CardTitle>{t.instructor.assignments}</CardTitle>
        {assignments.length === 0 ? (
          <EmptyState>{t.common.none}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.instructor.assignmentTitle}</Th>
                  <Th>{t.instructor.startAt}</Th>
                  <Th>{t.instructor.deadline}</Th>
                  <Th>{t.instructor.officialSeed}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <Td className="font-medium text-ink-100">{assignment.title}</Td>
                    <Td className="text-ink-300">{formatDateOnly(assignment.startAt, locale)}</Td>
                    <Td className="text-ink-300">{formatDateOnly(assignment.deadline, locale)}</Td>
                    <Td className="font-mono text-xs text-ink-400">{assignment.officialSeed}</Td>
                    <Td align="right">
                      <Link
                        href={`/instructor/assignments/${assignment.id}`}
                        className="text-brand-400 underline-offset-2 hover:underline"
                      >
                        {t.instructor.viewDetail}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </main>
  );
}
