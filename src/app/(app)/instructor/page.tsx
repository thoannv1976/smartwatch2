import Link from 'next/link';
import { requireRolePage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { listCoursesForStaff } from '@/server/instructor/queries';
import { getTranslations } from '@/i18n/server';
import { CreateCourseForm } from '@/components/instructor/CourseForms';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatDateOnly } from '@/lib/format';

export const metadata = { title: 'Giảng viên — Smartwatch CEO Challenge' };

/** Instructor dashboard: courses and their assignments (spec 9.4). */
export default async function InstructorPage() {
  const user = await requireRolePage('INSTRUCTOR', '/instructor');
  const { t, locale } = await getTranslations();

  const courses = await listCoursesForStaff(user.uid, user.role === 'ADMIN' ? 'ADMIN' : 'INSTRUCTOR');
  const assignments = await getRepositories().assignments.listByCourses(courses.map((c) => c.id));
  const assignmentsByCourse = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = assignmentsByCourse.get(assignment.courseId) ?? [];
    list.push(assignment);
    assignmentsByCourse.set(assignment.courseId, list);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title={t.instructor.title} subtitle={user.displayName} />

      <CreateCourseForm />

      {courses.length === 0 ? (
        <EmptyState>{t.instructor.courses}: {t.common.none}</EmptyState>
      ) : (
        courses.map((course) => {
          const courseAssignments = assignmentsByCourse.get(course.id) ?? [];
          return (
            <Card key={course.id}>
              <CardTitle
                hint={`${course.semester}`}
                right={
                  <Link
                    href={`/instructor/courses/${course.id}`}
                    className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-ink-100 transition hover:bg-ink-700"
                  >
                    {t.instructor.members} · {t.instructor.newAssignment}
                  </Link>
                }
              >
                {course.courseName}
              </CardTitle>

              {courseAssignments.length === 0 ? (
                <EmptyState>{t.home.officialNone}</EmptyState>
              ) : (
                <TableScroll>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <Th>{t.instructor.assignmentTitle}</Th>
                        <Th>{t.instructor.deadline}</Th>
                        <Th align="center">{t.instructor.maxAttempts}</Th>
                        <Th>{t.instructor.scenarioVersion}</Th>
                        <Th align="center">{t.instructor.isOpen}</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {courseAssignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <Td className="font-medium text-ink-100">{assignment.title}</Td>
                          <Td className="text-ink-300">
                            {formatDateOnly(assignment.deadline, locale)}
                          </Td>
                          <Td numeric align="center">
                            {assignment.maxAttempts}
                          </Td>
                          <Td className="font-mono text-xs text-ink-400">
                            {assignment.scenarioVersion} · {assignment.engineVersion}
                          </Td>
                          <Td align="center">
                            <Badge tone={assignment.isOpen ? 'good' : 'neutral'}>
                              {assignment.isOpen ? t.common.yes : t.common.no}
                            </Badge>
                          </Td>
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
          );
        })
      )}
    </main>
  );
}
