'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { POSITIONINGS, type Positioning } from '@/domain/simulation';
import { joinGroupAction } from '@/server/group/actions';
import { useI18n } from '@/i18n/client';
import { Card, CardTitle, ErrorNote } from '@/components/ui/primitives';

/**
 * Join a group by code, naming your company as you go.
 *
 * One form rather than two steps: a student who has just been given a code on
 * a projector wants to be in the match, and splitting "join" from "name your
 * company" would leave half-formed members sitting in seats.
 */
export function JoinGroupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [joinCode, setJoinCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [productName, setProductName] = useState('');
  const [positioning, setPositioning] = useState<Positioning>('BALANCED');
  const [error, setError] = useState<string | null>(null);

  const ready = joinCode.trim() && companyName.trim() && productName.trim() && !pending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setError(null);

    startTransition(async () => {
      const result = await joinGroupAction({ joinCode, companyName, productName, positioning });
      if (result.ok) router.replace(`/group/${result.data.groupId}`);
      else setError(t.errors[result.error]);
    });
  };

  return (
    <Card>
      <CardTitle hint={t.group.joinHint}>{t.group.joinTitle}</CardTitle>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.group.joinCode}
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            // Uppercase visually as they type; the server normalises anyway.
            className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2.5 font-mono text-lg tracking-[0.3em] text-ink-100 uppercase focus:border-brand-500 focus:outline-none"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.group.companyName}
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={60}
              className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-300">
            {t.group.productName}
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              maxLength={60}
              className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.newGame.positioning}
          <select
            value={positioning}
            onChange={(e) => setPositioning(e.target.value as Positioning)}
            className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
          >
            {POSITIONINGS.map((option) => (
              <option key={option} value={option}>
                {t.positioning[option]}
              </option>
            ))}
          </select>
          <span className="mt-1 text-xs text-ink-500">{t.positioningDesc[positioning]}</span>
        </label>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button
          type="submit"
          disabled={!ready}
          className="mt-1 rounded-lg bg-brand-500 px-6 py-3 text-base font-bold text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:self-start"
        >
          {pending ? t.group.joining : t.group.joinButton}
        </button>
      </form>
    </Card>
  );
}
