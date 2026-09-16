'use client';

import { useState } from 'react';

/**
 * A destructive action behind one confirmation click.
 *
 * Deliberately not a modal: archiving is reversible, so a dialog would cost
 * more attention than the action deserves. Equally not a bare button, because
 * removing a student or a whole class from every list should not happen by
 * brushing past it.
 *
 * Its own file rather than primitives.tsx: that module is imported by server
 * components, and a 'use client' directive only works at the top of a file, not
 * inside a function.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = 'warn',
  disabled = false,
}: {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  tone?: 'warn' | 'neutral';
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setArmed(true)}
        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
          tone === 'warn'
            ? 'border-warn-500/40 bg-warn-500/10 text-warn-500 hover:bg-warn-500/20'
            : 'border-ink-600 bg-ink-800 text-ink-200 hover:bg-ink-700'
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="rounded-md border border-warn-500/40 bg-warn-500/10 px-2.5 py-1 text-xs font-semibold text-warn-500 transition hover:bg-warn-500/20 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-300 transition hover:bg-ink-800"
      >
        {cancelLabel}
      </button>
    </span>
  );
}
