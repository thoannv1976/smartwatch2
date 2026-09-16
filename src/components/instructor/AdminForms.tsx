'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, type Role } from '@/db/models';
import {
  inviteRoleAction,
  revokeRoleInviteAction,
  setUserArchivedAction,
} from '@/server/instructor/actions';
import { useI18n } from '@/i18n/client';
import { ErrorNote } from '@/components/ui/primitives';
import { ConfirmButton } from '@/components/ui/ConfirmButton';

/** Admin-only controls: invite a role by email, disable an account. */

export function InviteRoleForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('INSTRUCTOR');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await inviteRoleAction({ email, role });
      if (result.ok) {
        setEmail('');
        setDone(true);
        router.refresh();
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink-300">
        {t.instructorAdmin.inviteEmail}
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-64 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-300">
        {t.instructorAdmin.inviteRole}
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
        >
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {t.roles[option]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
      >
        {t.instructorAdmin.inviteAdd}
      </button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {done ? <span className="text-xs text-good-400">{t.common.save}</span> : null}
    </form>
  );
}

export function RevokeInviteButton({ email }: { email: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <ConfirmButton
      label={t.instructorAdmin.inviteRevoke}
      confirmLabel={t.common.confirm}
      cancelLabel={t.common.cancel}
      disabled={pending}
      onConfirm={() =>
        startTransition(async () => {
          const result = await revokeRoleInviteAction({ email });
          if (result.ok) router.refresh();
          else setError(t.errors[result.error]);
        })
      }
    />
  );
}

export function UserArchiveButton({ uid, archived }: { uid: string; archived: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <ConfirmButton
      label={archived ? t.instructorAdmin.restoreUser : t.instructorAdmin.archiveUser}
      confirmLabel={t.common.confirm}
      cancelLabel={t.common.cancel}
      tone={archived ? 'neutral' : 'warn'}
      disabled={pending}
      onConfirm={() =>
        startTransition(async () => {
          const result = await setUserArchivedAction({ uid, archived: !archived });
          if (result.ok) router.refresh();
          else setError(t.errors[result.error]);
        })
      }
    />
  );
}
