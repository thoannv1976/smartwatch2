'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, type Role } from '@/db/models';
import { setUserRoleAction } from '@/server/instructor/actions';
import { useI18n } from '@/i18n/client';

/** Role picker for the admin user list (spec 9.3). */
export function RoleSelect({
  uid,
  role,
  isSelf,
}: {
  uid: string;
  role: Role;
  isSelf: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={role}
        disabled={pending || isSelf}
        onChange={(event) => {
          const next = event.target.value as Role;
          setError(null);
          startTransition(async () => {
            const result = await setUserRoleAction({ uid, role: next });
            if (result.ok) router.refresh();
            else setError(t.errors[result.error]);
          });
        }}
        className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1 text-xs text-ink-100 disabled:opacity-50"
        // An admin changing their own role could remove the last admin.
        title={isSelf ? t.admin.cannotDemoteSelf : undefined}
      >
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {t.roles[option]}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </span>
  );
}
