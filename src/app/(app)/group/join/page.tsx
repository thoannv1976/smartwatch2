import { getTranslations } from '@/i18n/server';
import { requireUserPage } from '@/server/auth/guards';
import { JoinGroupForm } from '@/components/group/JoinGroupForm';
import { PageHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Vào nhóm — Smartwatch CEO Challenge' };

/**
 * Where a student types the code their instructor gave their group.
 *
 * No list of groups to pick from, on purpose: a student should join the group
 * they were assigned to, not browse into somebody else's match.
 */
export default async function JoinGroupPage() {
  await requireUserPage('/group/join');
  const { t } = await getTranslations();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader title={t.group.title} subtitle={t.group.subtitle} />
      <JoinGroupForm />
    </main>
  );
}
