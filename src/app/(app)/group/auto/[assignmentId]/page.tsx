import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGroupService } from '@/server/group/service';
import { isGroupError } from '@/server/group/errors';
import { getTranslations } from '@/i18n/server';
import { ErrorNote, PageHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Ngành — Smartwatch CEO Challenge' };

/**
 * Industry mode, opened from the student home page: gives the student a seat in
 * an industry with room (or finds the one they have) and sends them there.
 *
 * Safe to open twice: a student who already has a seat is simply sent to it.
 */
export default async function AutoSeatPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const user = await requireUserPage(`/group/auto/${assignmentId}`);
  const { t } = await getTranslations();

  let groupId: string | null = null;
  let errorKey: keyof typeof t.errors | null = null;
  try {
    const service = createGroupService(getRepositories());
    const member = await service.autoSeat({
      assignmentId,
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
    });
    groupId = member.groupId;
  } catch (error) {
    if (!isGroupError(error)) throw error;
    errorKey = error.key;
  }

  if (groupId) redirect(`/group/${groupId}`);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title={t.group.industryTitle} subtitle={t.group.subtitle} />
      <ErrorNote>{errorKey ? t.errors[errorKey] : t.errors.groupNotFound}</ErrorNote>
      <Link href="/home" className="text-sm text-brand-400 underline-offset-2 hover:underline">
        {t.lti.goHome}
      </Link>
    </main>
  );
}
