'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  INVESTMENT_FIELDS,
  getGameConfig,
  riskWarnings,
  type CompanyState,
  type PositionPoint,
  type QuarterDecision,
  type QuarterForecast,
  type RivalNote,
  type StrategySuggestion,
} from '@/domain/simulation';
import { submitGroupDecisionAction } from '@/server/group/actions';
import { useI18n } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { DecisionInputs, type CapabilitySnapshot } from '@/components/game/DecisionInputs';
import { RiskWarningList } from '@/components/game/StrategyCoach';
import { ForecastInputs } from '@/components/game/ForecastInputs';
import { GroupSuggestions } from './GroupSuggestions';
import { PositioningMap, RivalNotes, SandboxPanel } from './RivalPanel';
import { Card, CardTitle, ErrorNote, InfoNote, WarningNote } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/format';

/**
 * The decision screen for a group match.
 *
 * Deliberately the same inputs, the same suggestions and the same risk
 * warnings as solo play — a student should not have to learn two screens — but
 * with two differences that matter:
 *
 *  - submitting is FINAL and visible to five other people who are waiting on
 *    it, so the warning says so;
 *  - the Golden Strategy is absent, and the screen says why rather than
 *    quietly hiding it. See `GroupSuggestions`.
 */
export function GroupDecisionScreen({
  groupId,
  quarter,
  scenarioVersion,
  capabilities,
  playerState,
  suggestions,
  previousDecisions,
  rivalNotes,
  positioning,
  seed,
}: {
  groupId: string;
  quarter: number;
  scenarioVersion: string;
  capabilities: CapabilitySnapshot;
  playerState: CompanyState;
  suggestions: StrategySuggestion[];
  previousDecisions: QuarterDecision[];
  rivalNotes: RivalNote[];
  positioning: PositionPoint[];
  seed: string;
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
  const [forecast, setForecast] = useState<QuarterForecast | null>(null);

  const total = INVESTMENT_FIELDS.reduce((sum, field) => sum + decision[field], 0);
  const canSubmit = total === config.strategyPoints && forecast !== null && !pending;

  // Recomputed on every keystroke. Advisory only — never touches canSubmit.
  const risks = riskWarnings(decision, playerState, previousDecisions, config);

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await submitGroupDecisionAction({ groupId, quarter, decision, forecast });
      if (!result.ok) {
        setError(t.errors[result.error]);
        return;
      }
      // Whether the market ran depends on whether this was the last decision
      // outstanding, so the lobby decides where to go next.
      router.replace(`/group/${groupId}`);
      router.refresh();
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

      <RivalNotes notes={rivalNotes} />

      <PositioningMap points={positioning} />

      <GroupSuggestions suggestions={suggestions} onApply={setDecision} disabled={pending} />

      <SandboxPanel
        playerState={playerState}
        decision={decision}
        quarter={quarter}
        seed={seed}
        config={config}
      />

      <RiskWarningList warnings={risks} />

      {/* In group mode this is the sharper question: predicting your rank means
          predicting five classmates, and the bench upstairs deliberately cannot
          tell you what they will do. */}
      <ForecastInputs
        value={forecast}
        onChange={setForecast}
        companyCount={config.competitors.length + 1}
        disabled={pending}
      />

      <WarningNote>
        {t.decision.lockedWarning} {interpolate(t.group.quarterRunning, { quarter })}
      </WarningNote>

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
