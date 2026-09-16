'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addGroupsAction,
  forceGroupQuarterAction,
  regenerateGroupCodeAction,
  releaseGroupSeatAction,
} from '@/server/instructor/actions';
import { useI18n } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { ErrorNote } from '@/components/ui/primitives';

/**
 * The instructor's controls over a group match.
 *
 * `Run the quarter now` is the important one. There is no automatic
 * per-quarter deadline — the design decision was to wait for all six — so this
 * button is the whole escape hatch when a group is stalled on one person. It
 * sits on the row of the group that is stuck, next to the name of whoever is
 * holding it up, rather than buried on a settings page.
 */

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  return { pending, error, note, setError, setNote, router, startTransition };
}

export function AddGroupsForm({ assignmentId }: { assignmentId: string }) {
  const { t } = useI18n();
  const { pending, error, setError, router, startTransition } = useAction();
  const [count, setCount] = useState(1);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addGroupsAction({ assignmentId, count });
      if (result.ok) router.refresh();
      else setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-ink-300">
        {t.groupAdmin.groupCount}
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className="w-24 rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t.groupAdmin.adding : t.groupAdmin.addGroups}
      </button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </form>
  );
}

export function ForceQuarterButton({
  groupId,
  disabled,
}: {
  groupId: string;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const { pending, error, note, setError, setNote, router, startTransition } = useAction();

  const run = () => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await forceGroupQuarterAction({ groupId });
      if (result.ok) {
        setNote(interpolate(t.groupAdmin.forced, { count: result.data.filled }));
        router.refresh();
      } else {
        setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
      }
    });
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending || disabled}
        title={t.groupAdmin.forceHint}
        className="rounded-md border border-warn-500/50 bg-warn-500/10 px-3 py-1.5 text-xs font-semibold text-warn-500 transition hover:bg-warn-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? t.groupAdmin.forcing : t.groupAdmin.forceRun}
      </button>
      {note ? <span className="text-xs text-good-400">{note}</span> : null}
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </span>
  );
}

export function RegenerateCodeButton({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const { pending, error, setError, router, startTransition } = useAction();

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await regenerateGroupCodeAction({ groupId });
            if (result.ok) router.refresh();
            else setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
          });
        }}
        disabled={pending}
        className="rounded-md border border-ink-600 px-2 py-1 text-xs text-ink-300 transition hover:bg-ink-800 disabled:opacity-50"
      >
        {t.groupAdmin.newCode}
      </button>
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </span>
  );
}

export function ReleaseSeatButton({ groupId, uid }: { groupId: string; uid: string }) {
  const { t } = useI18n();
  const { pending, error, setError, router, startTransition } = useAction();

  return (
    <span className="flex flex-col gap-1">
      <ConfirmButton
        label={t.groupAdmin.releaseSeat}
        confirmLabel={t.groupAdmin.releaseSeatConfirm}
        cancelLabel={t.common.cancel}
        tone="warn"
        disabled={pending}
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            const result = await releaseGroupSeatAction({ groupId, uid });
            if (result.ok) router.refresh();
            else setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
          });
        }}
      />
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </span>
  );
}
