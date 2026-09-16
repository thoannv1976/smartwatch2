'use client';

import { useState, useTransition } from 'react';
import {
  GOLDEN_STRATEGY_MAX_QUARTERS,
  INVESTMENT_FIELDS,
  type GoldenStrategy,
  type QuarterDecision,
  type RiskWarning,
  type StrategySuggestion,
} from '@/domain/simulation';
import { goldenStrategyAction } from '@/server/game/actions';
import { useI18n } from '@/i18n/client';
import { interpolate, type Dictionary, type Locale } from '@/i18n';
import { Card, CardTitle, ErrorNote, WarningNote } from '@/components/ui/primitives';
import { formatMoneyCompact } from '@/lib/format';
import { withAreaLabel } from '@/lib/area-label';

/**
 * The coach on the decision screen: three heuristic suggestions plus the
 * Golden Strategy button.
 *
 * The suggestions are pure rules over state the server already holds, so they
 * are computed there and passed in. The Golden Strategy is not: it costs one of
 * a strictly limited number of uses, so it goes through a server action that
 * claims the use in the datastore before it searches.
 */

export function StrategyCoach({
  sessionId,
  quarter,
  suggestions,
  usedQuarters,
  onApply,
  disabled,
}: {
  sessionId: string;
  quarter: number;
  suggestions: StrategySuggestion[];
  /** Quarters already coached in this session, as recorded on the server. */
  usedQuarters: number[];
  onApply: (decision: QuarterDecision) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();
  const [golden, setGolden] = useState<GoldenStrategy | null>(null);
  const [used, setUsed] = useState<number[]>(usedQuarters);
  const [error, setError] = useState<string | null>(null);
  const [appliedKey, setAppliedKey] = useState<string | null>(null);

  const alreadyThisQuarter = used.includes(quarter);
  const usesLeft = Math.max(0, GOLDEN_STRATEGY_MAX_QUARTERS - used.length);
  // Re-asking for a quarter already coached is free, so the button stays
  // available even when no uses remain.
  const canAsk = !disabled && !pending && (alreadyThisQuarter || usesLeft > 0);

  const askGolden = () => {
    setError(null);
    startTransition(async () => {
      const result = await goldenStrategyAction({ sessionId });
      if (result.ok) {
        setGolden(result.data.golden);
        setUsed(result.data.usedQuarters);
      } else {
        setError(t.errors[result.error]);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle hint={t.coach.subtitle}>{t.coach.title}</CardTitle>

        <div className="grid gap-3 sm:grid-cols-3">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.key}
              className="flex flex-col justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/50 p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-ink-100">
                  {t.coachTitle[suggestion.key]}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">
                  {interpolate(t.coachWhy[suggestion.key], withAreaLabel(t, suggestion.values))}
                </p>
                <p className="tnum mt-3 text-xs text-ink-500">
                  {INVESTMENT_FIELDS.map((field) => suggestion.decision[field]).join(' · ')} ·{' '}
                  {suggestion.decision.priceIndex}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onApply(suggestion.decision);
                  setAppliedKey(suggestion.key);
                }}
                disabled={disabled}
                className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-400 transition hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {appliedKey === suggestion.key ? t.coach.applied : t.coach.apply}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-500">{t.coach.heuristicNote}</p>
      </Card>

      <Card className="border-warn-500/40">
        <CardTitle
          hint={t.coach.goldenHint}
          right={
            <span className="tnum shrink-0 text-right text-xs text-ink-400">
              {alreadyThisQuarter
                ? t.coach.goldenAlreadyThisQuarter
                : interpolate(t.coach.goldenUsesLeft, {
                    left: usesLeft,
                    max: GOLDEN_STRATEGY_MAX_QUARTERS,
                  })}
            </span>
          }
        >
          {t.coach.goldenTitle}
        </CardTitle>

        {golden ? (
          <GoldenResult
            t={t}
            locale={locale}
            golden={golden}
            onApply={onApply}
            disabled={disabled}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={askGolden}
              disabled={!canAsk}
              className="rounded-lg bg-warn-500 px-5 py-2.5 text-sm font-bold text-ink-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? t.coach.goldenSearching : t.coach.goldenButton}
            </button>

            {usesLeft === 0 && !alreadyThisQuarter ? (
              <div className="mt-3">
                <WarningNote>{t.coach.goldenNoUses}</WarningNote>
              </div>
            ) : null}
          </>
        )}

        {error ? (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function GoldenResult({
  t,
  locale,
  golden,
  onApply,
  disabled,
}: {
  t: Dictionary;
  locale: Locale;
  golden: GoldenStrategy;
  onApply: (decision: QuarterDecision) => void;
  disabled: boolean;
}) {
  const advantage = golden.best.netProfit - golden.baseline.netProfit;
  const capabilityLabels: Record<string, string> = {
    productQuality: t.kpi.productQuality,
    technology: t.kpi.technology,
    distribution: t.kpi.distribution,
    customerExperience: t.kpi.customerExperience,
  };
  const givenUp = Object.entries(golden.capabilityCost).filter(([, value]) => value < 0);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-ink-100">
        {interpolate(t.coach.goldenResult, {
          quarterShort: t.common.quarterShort,
          quarter: golden.quarter,
        })}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <Figure
          label={`${t.coach.goldenProfit} · ${t.coach.goldenBaseline}`}
          value={formatMoneyCompact(golden.baseline.netProfit, locale)}
          detail={`${INVESTMENT_FIELDS.map((f) => golden.baseline.decision[f]).join(' · ')} · ${golden.baseline.decision.priceIndex}`}
        />
        <Figure
          emphasis
          label={`${t.coach.goldenProfit} · ${t.coach.goldenTitle}`}
          value={formatMoneyCompact(golden.best.netProfit, locale)}
          detail={`${INVESTMENT_FIELDS.map((f) => golden.best.decision[f]).join(' · ')} · ${golden.best.decision.priceIndex}`}
        />
      </div>

      <p className="tnum text-xs text-ink-400">
        {t.coach.goldenAdvantage}: {formatMoneyCompact(advantage, locale)} ·{' '}
        {interpolate(t.coach.goldenCombos, { count: golden.combinationsTried })}
      </p>

      <p className="max-w-prose text-xs text-ink-400">
        {interpolate(t.coach.goldenWeights, {
          product: Math.round(golden.weights.product * 100),
          price: Math.round(golden.weights.price * 100),
          brand: Math.round(golden.weights.brand * 100),
          marketing: Math.round(golden.weights.marketing * 100),
          distribution: Math.round(golden.weights.distribution * 100),
          cx: Math.round(golden.weights.cx * 100),
        })}
      </p>

      {/* The honest half: the objective is THIS quarter, and this is what that
          costs in the quarters after it. */}
      <div className="rounded-lg border border-ink-700/60 bg-ink-900/60 p-4">
        <h4 className="text-xs font-semibold tracking-wide text-warn-500 uppercase">
          {t.coach.goldenTradeoffTitle}
        </h4>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-300">
          {t.coach.goldenTradeoff}
        </p>
        {givenUp.length > 0 ? (
          <ul className="tnum mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-400">
            {givenUp.map(([key, value]) => (
              <li key={key}>
                {capabilityLabels[key] ?? key}:{' '}
                <span className="text-bad-400">{value.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-ink-400">{t.coach.goldenNoTradeoff}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onApply(golden.best.decision)}
        disabled={disabled}
        className="self-start rounded-md border border-warn-500/50 bg-warn-500/10 px-4 py-2 text-xs font-semibold text-warn-500 transition hover:bg-warn-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.coach.apply}
      </button>
    </div>
  );
}

function Figure({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasis ? 'border-warn-500/40 bg-warn-500/10' : 'border-ink-700/60 bg-ink-900/50'
      }`}
    >
      <p className="text-xs text-ink-400">{label}</p>
      <p className="tnum mt-1 text-lg font-semibold text-ink-100">{value}</p>
      <p className="tnum mt-1 text-xs text-ink-500">{detail}</p>
    </div>
  );
}

/**
 * Risk warnings, shown directly above the submit button.
 *
 * Deliberately not a blocker: the submit button stays enabled behind this, and
 * nothing here is validation. A warning that stops you is a rule, and a rule
 * teaches nothing.
 */
export function RiskWarningList({ warnings }: { warnings: RiskWarning[] }) {
  const { t } = useI18n();
  if (warnings.length === 0) return null;

  return (
    <Card className="border-warn-500/30">
      <CardTitle hint={t.coach.riskHint}>{t.coach.riskTitle}</CardTitle>
      <ul className="flex flex-col gap-2">
        {warnings.map((warning) => (
          <li key={warning.key} className="text-sm leading-relaxed text-ink-300">
            • {interpolate(t.risks[warning.key], withAreaLabel(t, warning.values))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
