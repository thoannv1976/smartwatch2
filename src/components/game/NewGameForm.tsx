'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  POSITIONINGS,
  VARIED_SCENARIO_VERSION,
  type Positioning,
} from '@/domain/simulation';
import { createSessionAction } from '@/server/game/actions';
import { useI18n } from '@/i18n/client';
import { Card, CardTitle, ErrorNote, InfoNote } from '@/components/ui/primitives';

/** Create Company screen (spec 3.2, 12). */
export function NewGameForm({
  mode,
  assignmentId,
  assignmentTitle,
}: {
  mode: 'PRACTICE' | 'OFFICIAL';
  assignmentId: string | null;
  assignmentTitle: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [companyName, setCompanyName] = useState('');
  const [productName, setProductName] = useState('');
  const [positioning, setPositioning] = useState<Positioning>('BALANCED');
  // Practice only. An official attempt takes its scenario from the assignment:
  // a student must never choose the market they are graded on.
  const [varied, setVaried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyName.trim()) return setError(t.newGame.errors.companyNameRequired);
    if (!productName.trim()) return setError(t.newGame.errors.productNameRequired);
    if (companyName.length > 60 || productName.length > 60) {
      return setError(t.newGame.errors.tooLong);
    }
    setError(null);

    startTransition(async () => {
      const result = await createSessionAction({
        mode,
        assignmentId,
        companyName,
        productName,
        positioning,
        scenarioVersion: mode === 'PRACTICE' && varied ? VARIED_SCENARIO_VERSION : undefined,
      });
      if (result.ok) router.replace(`/game/${result.data.sessionId}`);
      else setError(t.errors[result.error]);
    });
  };

  return (
    <Card>
      <CardTitle hint={t.newGame.subtitle}>
        {t.newGame.title}
        {assignmentTitle ? ` · ${assignmentTitle}` : ''}
      </CardTitle>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.newGame.companyName}
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t.newGame.companyNamePlaceholder}
            maxLength={60}
            className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink-300">
          {t.newGame.productName}
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder={t.newGame.productNamePlaceholder}
            maxLength={60}
            className="rounded-md border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 focus:border-brand-500 focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="text-xs text-ink-300">{t.newGame.positioning}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {POSITIONINGS.map((option) => (
              <label
                key={option}
                className={`cursor-pointer rounded-lg border p-3 transition ${
                  positioning === option
                    ? 'border-brand-600 bg-brand-500/10'
                    : 'border-ink-700 bg-ink-900/50 hover:border-ink-600'
                }`}
              >
                <input
                  type="radio"
                  name="positioning"
                  value={option}
                  checked={positioning === option}
                  onChange={() => setPositioning(option)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold text-ink-100">
                  {t.positioning[option]}
                </span>
                <span className="mt-0.5 block text-xs text-ink-400">
                  {t.positioningDesc[option]}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">{t.newGame.positioningHint}</p>
        </fieldset>

        {/* Practice only, and absent entirely from an official attempt — the
            market you are graded on is the assignment's, never your own pick. */}
        {mode === 'PRACTICE' ? (
          <label className="flex max-w-prose cursor-pointer items-start gap-3 rounded-lg border border-ink-700/60 bg-ink-900/50 p-4">
            <input
              type="checkbox"
              checked={varied}
              onChange={(e) => setVaried(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-ink-100">
                {t.newGame.variedMarket}
              </span>
              <span className="mt-0.5 block text-xs text-ink-400">
                {t.newGame.variedMarketHint}
              </span>
            </span>
          </label>
        ) : null}

        {mode === 'OFFICIAL' ? <InfoNote>{t.home.officialDesc}</InfoNote> : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50"
        >
          {pending ? t.common.loading : t.newGame.startGame}
        </button>
      </form>
    </Card>
  );
}
