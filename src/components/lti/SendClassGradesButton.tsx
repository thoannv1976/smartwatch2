'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { ErrorNote } from '@/components/ui/primitives';
import { sendClassGradesAction } from '@/server/lti/actions';

export function SendClassGradesButton({ assignmentId }: { assignmentId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const send = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await sendClassGradesAction({ assignmentId });
      if (!result.ok) {
        setMessage({ ok: false, text: t.lti.errors[result.error] });
      } else if (result.data.failed.length) {
        setMessage({ ok: false, text: interpolate(t.lti.sendFailed, { error: result.data.failed.join('; ') }) });
      } else if (result.data.rows === 0) {
        setMessage({ ok: true, text: t.lti.sendNone });
      } else {
        setMessage({ ok: true, text: interpolate(t.lti.sendDone, { rows: result.data.rows }) });
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition hover:bg-brand-400 disabled:opacity-50"
      >
        <Send className="h-4 w-4" aria-hidden />
        {pending ? t.lti.sending : t.lti.sendButton}
      </button>
      {message ? (
        message.ok ? (
          <p className="rounded-lg border border-good-500/30 bg-good-500/10 px-3 py-2 text-sm text-good-400">
            {message.text}
          </p>
        ) : (
          <ErrorNote>{message.text}</ErrorNote>
        )
      ) : null}
    </div>
  );
}
