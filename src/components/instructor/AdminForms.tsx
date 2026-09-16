'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, type Role } from '@/db/models';
import {
  createUserAction,
  inviteRoleAction,
  passwordResetLinkAction,
  revokeRoleInviteAction,
  setUserArchivedAction,
  setUserPasswordAction,
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

/**
 * Creates a sign-in account plus its user document.
 *
 * The password is echoed back once, because the admin has to be able to pass it
 * on and nothing stores it. It is held in component state only, and is cleared
 * as soon as the form is used again.
 */
export function CreateUserForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('STUDENT');
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState<{ password: string; adopted: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIssued(null);
    startTransition(async () => {
      const result = await createUserAction({ email, displayName, role, password });
      if (!result.ok) {
        setError(t.errors[result.error]);
        return;
      }
      setIssued({ password, adopted: result.data.adopted });
      setEmail('');
      setDisplayName('');
      setPassword('');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.instructorAdmin.inviteEmail}
          <input
            id="new-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-56 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.account.displayName}
          <input
            id="new-user-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            className="w-48 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.instructorAdmin.inviteRole}
          <select
            id="new-user-role"
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
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.account.initialPassword}
          <input
            id="new-user-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.account.passwordRule}
            autoComplete="off"
            className="w-48 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !email.trim() || !displayName.trim() || password.length < 8}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
        >
          {pending ? t.account.creating : t.account.create}
        </button>
      </form>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {issued ? (
        <div className="rounded-lg border border-good-500/40 bg-good-500/10 p-4 text-sm">
          <p className="font-semibold text-good-400">
            {issued.adopted ? t.account.adopted : t.account.created}
          </p>
          {issued.adopted ? null : (
            <>
              <p className="mt-2 font-mono text-base text-ink-100">{issued.password}</p>
              <p className="mt-1 text-xs text-ink-400">{t.account.passwordOnce}</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Sets a password, or issues a reset link, for one account. */
export function PasswordControls({ uid }: { uid: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'idle' | 'setting'>('idle');
  const [password, setPassword] = useState('');
  const [needsGoogleConfirm, setNeedsGoogleConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (confirmNoPassword: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setUserPasswordAction({ uid, password, confirmNoPassword });
      if (result.ok) {
        setNotice(`${t.account.passwordSet} ${password}`);
        setNeedsGoogleConfirm(false);
        setMode('idle');
        setPassword('');
        return;
      }
      // The first refusal on a Google account is not a failure: it is the
      // system asking the admin to acknowledge what will happen.
      if (result.error === 'accountUsesGoogle') {
        setNeedsGoogleConfirm(true);
        setError(t.errors.accountUsesGoogle);
        return;
      }
      setError(t.errors[result.error]);
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      {mode === 'idle' ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('setting');
              setNotice(null);
              setLink(null);
              setError(null);
            }}
            className="rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 text-xs text-ink-200 transition hover:bg-ink-700"
          >
            {t.account.setPassword}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setNotice(null);
                const result = await passwordResetLinkAction({ uid });
                if (result.ok) setLink(result.data.link);
                else setError(t.errors[result.error]);
              })
            }
            className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-300 transition hover:bg-ink-800 disabled:opacity-50"
          >
            {t.account.resetLink}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            id={`set-password-${uid}`}
            type="text"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setNeedsGoogleConfirm(false);
            }}
            placeholder={t.account.passwordRule}
            autoComplete="off"
            className="w-44 rounded-md border border-ink-600 bg-ink-950 px-2 py-1 font-mono text-xs text-ink-100"
          />
          {needsGoogleConfirm ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => apply(true)}
              className="rounded-md border border-warn-500/40 bg-warn-500/10 px-2.5 py-1 text-xs font-semibold text-warn-500 transition hover:bg-warn-500/20 disabled:opacity-50"
            >
              {t.account.confirmGoogle}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || password.length < 8}
              onClick={() => apply(false)}
              className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-ink-950 disabled:opacity-50"
            >
              {t.common.save}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('idle');
              setPassword('');
              setNeedsGoogleConfirm(false);
              setError(null);
            }}
            className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-300"
          >
            {t.common.cancel}
          </button>
        </div>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? (
        <p className="max-w-xs text-right font-mono text-xs text-good-400">{notice}</p>
      ) : null}
      {link ? (
        <div className="max-w-xs text-right">
          <p className="text-xs text-ink-400">{t.account.resetLinkReady}</p>
          <textarea
            id={`reset-link-${uid}`}
            readOnly
            value={link}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1 font-mono text-[10px] text-ink-200"
          />
        </div>
      ) : null}
    </div>
  );
}
