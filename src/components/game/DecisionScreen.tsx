'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  INVESTMENT_FIELDS,
  getGameConfig,
  type QuarterDecision,
} from '@/domain/simulation';
import { submitQuarterAction } from '@/server/game/actions';
import { useI18n } from '@/i18n/client';
import { DecisionInputs, type CapabilitySnapshot } from './DecisionInputs';
import { Card, CardTitle, ErrorNote, InfoNote, WarningNote } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/format';

/**
 * The decision screen (spec 4, 12.1).
 *
 * The browser sends the five investments and the price index and nothing else.
 * It deliberately shows no profit forecast: the point of the exercise is to
 * commit to a strategy and then face the market.
 */
export function DecisionScreen({
  sessionId,
  quarter,
  scenarioVersion,
  capabilities,
  isOfficial,
}: {
  sessionId: string;
  quarter: number;
  scenarioVersion: string;
  capabilities: CapabilitySnapshot;
  isOfficial: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const config = getGameConfig(scenarioVersion);

  const [decision, setDecision] = useState<QuarterDecision>({
    productPoints: 20,
    technologyPoints: 20,
    marketingPoints: 20,
    distributionPoints: 20,
    cxPoints: 20,
    priceIndex: 100,
  });
  const [error, setError] = useState<string | null>(null);

  const total = INVESTMENT_FIELDS.reduce((sum, field) => sum + decision[field], 0);
  const canSubmit = total === config.strategyPoints && !pending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await submitQuarterAction({ sessionId, quarter, decision });
      if (result.ok) {
        router.replace(`/game/${sessionId}/result/${result.data.quarter}`);
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle hint={t.decision.subtitle}>
          {t.common.quarterShort}
          {quarter} · {t.decision.title}
        </CardTitle>

        <DecisionInputs
          value={decision}
          onChange={setDecision}
          config={config}
          capabilities={capabilities}
          disabled={pending}
        />
      </Card>

      <Card>
        <CardTitle>{t.decision.investmentCost}</CardTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3">
            <dt className="text-xs text-ink-400">{t.decision.investmentCost}</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink-100">
              {formatMoney(config.quarterlyStrategicInvestment, locale)}
            </dd>
          </div>
          <div className="rounded-lg border border-ink-700/60 bg-ink-900/50 p-3">
            <dt className="text-xs text-ink-400">{t.decision.fixedCost}</dt>
            <dd className="tnum mt-1 text-lg font-semibold text-ink-100">
              {formatMoney(config.quarterlyFixedOperatingCost, locale)}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <InfoNote>{t.decision.noProfitPreview}</InfoNote>
        </div>
      </Card>

      {isOfficial ? <WarningNote>{t.decision.lockedWarning}</WarningNote> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-brand-500 px-6 py-3 text-base font-bold text-ink-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:self-start"
      >
        {pending ? t.decision.submitting : t.decision.submitDecision}
      </button>
    </div>
  );
}
