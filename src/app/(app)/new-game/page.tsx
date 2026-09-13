import { redirect } from 'next/navigation';
import { NewGameForm } from '@/components/game/NewGameForm';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { PageHeader } from '@/components/ui/primitives';
import { getTranslations } from '@/i18n/server';

export const metadata = { title: 'Thành lập công ty — Smartwatch CEO Challenge' };

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; assignmentId?: string }>;
}) {
  await requireUserPage('/new-game');
  const { t } = await getTranslations();
  const params = await searchParams;

  const mode = params.mode === 'OFFICIAL' ? 'OFFICIAL' : 'PRACTICE';
  const assignmentId = mode === 'OFFICIAL' ? (params.assignmentId ?? null) : null;
  if (mode === 'OFFICIAL' && !assignmentId) redirect('/home');

  const assignment = assignmentId
    ? await getRepositories().assignments.get(assignmentId)
    : null;
  if (mode === 'OFFICIAL' && !assignment) redirect('/home');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.newGame.title}
        subtitle={mode === 'OFFICIAL' ? t.home.officialTitle : t.home.practiceTitle}
      />
      <NewGameForm
        mode={mode}
        assignmentId={assignmentId}
        assignmentTitle={assignment?.title ?? null}
      />
    </main>
  );
}
