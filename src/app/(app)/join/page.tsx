import Link from 'next/link';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createEnrollmentService } from '@/server/game/enrollment';
import { getTranslations } from '@/i18n/server';
import { EnrolledCourses, JoinableCourses } from '@/components/game/EnrollmentPanels';
import { PageHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Tham gia lớp học — Smartwatch CEO Challenge' };

/** Students pick their own class here (plan: self-enrolment from an open list). */
export default async function JoinPage() {
  const user = await requireUserPage('/join');
  const { t, locale } = await getTranslations();

  const service = createEnrollmentService(getRepositories());
  const [joinable, enrolled] = await Promise.all([
    service.listJoinable(user.uid),
    service.listEnrolled(user.uid),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.enroll.title}
        subtitle={t.enroll.subtitle}
        right={
          <Link
            href="/home"
            className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-ink-100 transition hover:bg-ink-700"
          >
            {t.home.title}
          </Link>
        }
      />

      <EnrolledCourses courses={enrolled} locale={locale} />
      <JoinableCourses courses={joinable} />
    </main>
  );
}
