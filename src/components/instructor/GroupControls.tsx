'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addGroupsAction,
  autoAssignIndustriesAction,
  forceGroupQuarterAction,
  regenerateGroupCodeAction,
  releaseGroupSeatAction,
  renameGroupAction,
  setGroupArchivedAction,
  setGroupSeatingAction,
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
          className="w-24 rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
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

/**
 * Renames one group.
 *
 * Groups are created in bulk as "Group 1..N", which is fine until a class
 * names its own teams — and then the instructor is reading a progress table
 * whose rows match nothing anyone says out loud.
 */
export function RenameGroupForm({ groupId, name }: { groupId: string; name: string }) {
  const { t } = useI18n();
  const { pending, error, setError, router, startTransition } = useAction();
  const [value, setValue] = useState(name);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === name) return;
    setError(null);
    startTransition(async () => {
      const result = await renameGroupAction({ groupId, name: trimmed });
      if (result.ok) router.refresh();
      else setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={value}
        maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        aria-label={t.groupAdmin.renameGroup}
        className="w-44 rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 text-xs text-ink-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending || value.trim().length === 0 || value.trim() === name}
        className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? t.groupAdmin.renaming : t.groupAdmin.renameGroup}
      </button>
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </form>
  );
}

/** Soft delete, both ways. A played match is hidden, never destroyed. */
export function ArchiveGroupButton({
  groupId,
  archived,
}: {
  groupId: string;
  archived: boolean;
}) {
  const { t } = useI18n();
  const { pending, error, setError, router, startTransition } = useAction();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await setGroupArchivedAction({ groupId, archived: !archived });
      if (result.ok) router.refresh();
      else setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
    });
  };

  return (
    <span className="flex flex-col gap-1">
      {archived ? (
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-900 disabled:opacity-50"
        >
          {t.groupAdmin.unarchiveGroup}
        </button>
      ) : (
        <ConfirmButton
          label={t.groupAdmin.archiveGroup}
          confirmLabel={t.groupAdmin.archiveGroupConfirm}
          cancelLabel={t.common.cancel}
          tone="warn"
          disabled={pending}
          onConfirm={run}
        />
      )}
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </span>
  );
}

/**
 * Re-reads the page.
 *
 * The instructor's status table is server-rendered, so it is a snapshot of the
 * moment it loaded. An instructor watching a group decide in class needs to ask
 * again without losing their place on the page — and unlike the students'
 * button, this one only re-reads: it never advances the match, because the
 * instructor already has an explicit button for that and the two should not be
 * the same click.
 */
export function RefreshButton() {
  const { t } = useI18n();
  const { pending, router, startTransition } = useAction();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-900 disabled:opacity-50"
    >
      {pending ? t.group.refreshing : t.group.refresh}
    </button>
  );
}

/**
 * Industry mode: deals every roster student without a seat into industries of
 * six (90 students make 15). Students who already have a seat stay put, so it
 * is safe to press again after more students join.
 */
export function AutoAssignIndustriesButton({
  assignmentId,
  disabled,
}: {
  assignmentId: string;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const { pending, error, note, setError, setNote, router, startTransition } = useAction();

  const run = () => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await autoAssignIndustriesAction({ assignmentId });
      if (!result.ok) {
        setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
        return;
      }
      const d = result.data;
      const parts = [
        d.seated === 0
          ? t.groupAdmin.autoAssignNothing
          : interpolate(t.groupAdmin.autoAssignDone, { seated: d.seated, groups: d.createdGroups }),
      ];
      if (d.unplaced > 0) parts.push(interpolate(t.groupAdmin.autoAssignUnplaced, { count: d.unplaced }));
      setNote(parts.join(' '));
      router.refresh();
    });
  };

  return (
    <span className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending || disabled}
        className="rounded-lg bg-brand-500 shadow-sm shadow-brand-500/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t.groupAdmin.autoAssigning : t.groupAdmin.autoAssignButton}
      </button>
      {note ? <span className="text-sm text-good-400">{note}</span> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </span>
  );
}

/** Industry mode on/off: whether students without a seat are placed automatically. */
export function SeatingToggle({
  assignmentId,
  seating,
}: {
  assignmentId: string;
  seating: 'CODE' | 'AUTO';
}) {
  const { t } = useI18n();
  const { pending, error, setError, router, startTransition } = useAction();
  const next = seating === 'AUTO' ? 'CODE' : 'AUTO';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-200">
        {t.groupAdmin.seatingLabel}:{' '}
        <span className="font-semibold">
          {seating === 'AUTO' ? t.groupAdmin.seatingAuto : t.groupAdmin.seatingCode}
        </span>
      </p>
      <p className="text-xs text-ink-400">{t.groupAdmin.seatingAutoHint}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setGroupSeatingAction({ assignmentId, seating: next });
            if (result.ok) router.refresh();
            else setError(t.errors[result.error as keyof typeof t.errors] ?? result.error);
          });
        }}
        className="self-start rounded-lg border border-ink-700 bg-ink-850 shadow-sm px-3 py-1.5 text-xs text-ink-100 transition hover:bg-ink-900 disabled:opacity-50"
      >
        {seating === 'AUTO' ? t.groupAdmin.seatingTurnOff : t.groupAdmin.seatingTurnOn}
      </button>
      {error ? <span className="text-xs text-bad-400">{error}</span> : null}
    </div>
  );
}
