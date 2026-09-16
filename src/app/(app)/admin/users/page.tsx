import Link from 'next/link';
import { requireRolePage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { isArchived, ROLES, type Role } from '@/db/models';
import { getTranslations } from '@/i18n/server';
import { RoleSelect } from '@/components/instructor/RoleSelect';
import { InviteRoleForm, RevokeInviteButton, UserArchiveButton } from '@/components/instructor/AdminForms';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  InfoNote,
  PageHeader,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Người dùng — Smartwatch CEO Challenge' };

/** Admin user management: roles, disabled accounts, and invites by email. */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const admin = await requireRolePage('ADMIN', '/admin/users');
  const { t, locale } = await getTranslations();
  const query = await searchParams;

  const repos = getRepositories();
  const [allUsers, invites] = await Promise.all([repos.users.list(500), repos.roleInvites.list()]);

  const needle = (query.q ?? '').trim().toLowerCase();
  const roleFilter = ROLES.includes(query.role as Role) ? (query.role as Role) : null;

  const users = allUsers.filter((user) => {
    if (roleFilter && user.role !== roleFilter) return false;
    if (!needle) return true;
    return (
      user.email.toLowerCase().includes(needle) ||
      user.displayName.toLowerCase().includes(needle)
    );
  });

  const pendingInvites = invites.filter((invite) => invite.claimedAt === null);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t.admin.users}
        subtitle={admin.displayName}
        right={
          <Link
            href="/admin"
            className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-ink-100 transition hover:bg-ink-700"
          >
            {t.admin.title}
          </Link>
        }
      />

      <Card>
        <CardTitle hint={t.instructorAdmin.inviteHint}>{t.instructorAdmin.inviteTitle}</CardTitle>
        <InviteRoleForm />

        <div className="mt-4">
          {pendingInvites.length === 0 ? (
            <EmptyState>{t.instructorAdmin.noInvites}</EmptyState>
          ) : (
            <TableScroll>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>{t.instructorAdmin.inviteEmail}</Th>
                    <Th>{t.instructorAdmin.inviteRole}</Th>
                    <Th>{t.home.startedAt}</Th>
                    <Th align="right" />
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((invite) => (
                    <tr key={invite.email}>
                      <Td className="font-mono text-xs text-ink-100">{invite.email}</Td>
                      <Td>
                        <Badge tone="brand">{t.roles[invite.role]}</Badge>
                      </Td>
                      <Td className="text-ink-400">{formatDate(invite.createdAt, locale)}</Td>
                      <Td align="right">
                        <RevokeInviteButton email={invite.email} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle
          hint={t.instructorAdmin.archivedUserNote}
          right={
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input
                id="user-search"
                type="search"
                name="q"
                defaultValue={query.q ?? ''}
                placeholder={t.common.search}
                className="w-48 rounded-md border border-ink-600 bg-ink-950 px-3 py-1.5 text-xs text-ink-100"
              />
              <select
                id="user-role-filter"
                name="role"
                defaultValue={roleFilter ?? ''}
                className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-xs text-ink-100"
              >
                <option value="">{t.common.total}</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t.roles[role]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-ink-100 transition hover:bg-ink-700"
              >
                {t.common.search}
              </button>
            </form>
          }
        >
          {t.admin.users} ({users.length}/{allUsers.length})
        </CardTitle>

        {users.length === 0 ? (
          <EmptyState>{t.common.none}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.auth.displayName}</Th>
                  <Th>{t.auth.email}</Th>
                  <Th>{t.admin.changeRole}</Th>
                  <Th>{t.home.startedAt}</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.uid}>
                    <Td className="text-ink-100">
                      {user.displayName}{' '}
                      {isArchived(user) ? (
                        <Badge tone="warn">{t.instructorAdmin.archived}</Badge>
                      ) : null}
                    </Td>
                    <Td className="text-ink-400">{user.email}</Td>
                    <Td>
                      <RoleSelect uid={user.uid} role={user.role} isSelf={user.uid === admin.uid} />
                    </Td>
                    <Td className="text-ink-400">{formatDate(user.createdAt, locale)}</Td>
                    <Td align="right">
                      {user.uid === admin.uid ? null : (
                        <UserArchiveButton uid={user.uid} archived={isArchived(user)} />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}

        <div className="mt-4">
          <InfoNote>{t.instructorAdmin.archivedUserNote}</InfoNote>
        </div>
      </Card>
    </main>
  );
}
