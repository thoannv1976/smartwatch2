'use client';

import { INVESTMENT_FIELDS, type GameConfig, type InvestmentField, type QuarterDecision } from '@/domain/simulation';
import { useI18n } from '@/i18n/client';
import { formatMoney, formatScore } from '@/lib/format';
import { seriesColor } from '@/components/charts/series';

/**
 * The five investment sliders plus the price index control (spec 12.1).
 *
 * Controlled component reused by the student decision screen and the internal
 * simulation test page, so both validate identically: points remaining updates
 * in real time, submission is blocked unless the five areas total exactly 100,
 * the price index is clamped to 80-120, the estimated selling price is shown —
 * and no profit forecast is ever displayed before submission.
 */

export interface CapabilitySnapshot {
  productQuality: number;
  technology: number;
  distribution: number;
  customerExperience: number;
}

const FIELD_LABEL_KEYS: Record<InvestmentField, 'product' | 'technology' | 'marketing' | 'distribution' | 'cx'> = {
  productPoints: 'product',
  technologyPoints: 'technology',
  marketingPoints: 'marketing',
  distributionPoints: 'distribution',
  cxPoints: 'cx',
};

/** Which accumulating capability each investment area feeds, for context display. */
const FIELD_CAPABILITY: Record<InvestmentField, keyof CapabilitySnapshot | null> = {
  productPoints: 'productQuality',
  technologyPoints: 'technology',
  marketingPoints: null, // marketing strength is a per-quarter flow, not a stock
  distributionPoints: 'distribution',
  cxPoints: 'customerExperience',
};

export function DecisionInputs({
  value,
  onChange,
  config,
  capabilities,
  disabled = false,
}: {
  value: QuarterDecision;
  onChange: (next: QuarterDecision) => void;
  config: GameConfig;
  capabilities?: CapabilitySnapshot;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();

  const used = INVESTMENT_FIELDS.reduce((sum, field) => sum + value[field], 0);
  const remaining = config.strategyPoints - used;
  const exact = remaining === 0;

  const setField = (field: InvestmentField, raw: number) => {
    const next = Math.max(0, Math.min(100, Math.round(raw)));
    onChange({ ...value, [field]: next });
  };

  const price = (config.referencePrice * value.priceIndex) / 100;

  const applyPreset = (preset: Record<InvestmentField, number>) => {
    onChange({ ...value, ...preset });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Points remaining, in real time */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          exact
            ? 'border-good-500/40 bg-good-500/10'
            : 'border-warn-500/40 bg-warn-500/10'
        }`}
      >
        <div>
          <p className="text-xs text-ink-300">
            {t.decision.pointsUsed}: <span className="tnum font-semibold text-ink-100">{used}</span>{' '}
            / {config.strategyPoints}
          </p>
          <p
            className={`tnum text-lg font-bold ${exact ? 'text-good-400' : 'text-warn-500'}`}
            aria-live="polite"
          >
            {t.decision.pointsRemaining}: {remaining}
          </p>
        </div>
        <p className={`text-xs ${exact ? 'text-good-400' : 'text-warn-500'}`}>
          {exact ? t.decision.pointsOk : t.decision.pointsMustEqual}
        </p>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-400">{t.decision.presetTitle}:</span>
        <PresetButton
          label={t.decision.presetBalanced}
          disabled={disabled}
          onClick={() =>
            applyPreset({
              productPoints: 20,
              technologyPoints: 20,
              marketingPoints: 20,
              distributionPoints: 20,
              cxPoints: 20,
            })
          }
        />
        <PresetButton
          label={t.decision.presetInnovation}
          disabled={disabled}
          onClick={() =>
            applyPreset({
              productPoints: 30,
              technologyPoints: 30,
              marketingPoints: 15,
              distributionPoints: 10,
              cxPoints: 15,
            })
          }
        />
        <PresetButton
          label={t.decision.presetGrowth}
          disabled={disabled}
          onClick={() =>
            applyPreset({
              productPoints: 15,
              technologyPoints: 15,
              marketingPoints: 35,
              distributionPoints: 25,
              cxPoints: 10,
            })
          }
        />
        <PresetButton
          label={t.decision.presetReset}
          disabled={disabled}
          onClick={() =>
            applyPreset({
              productPoints: 0,
              technologyPoints: 0,
              marketingPoints: 0,
              distributionPoints: 0,
              cxPoints: 0,
            })
          }
        />
      </div>

      {/* The five investment areas */}
      <div className="flex flex-col gap-4">
        {INVESTMENT_FIELDS.map((field) => {
          const labelKey = FIELD_LABEL_KEYS[field];
          const capabilityKey = FIELD_CAPABILITY[field];
          const current =
            capabilities && capabilityKey ? capabilities[capabilityKey] : null;

          return (
            <div key={field} className="rounded-lg border border-ink-700/60 bg-ink-900/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <label
                    htmlFor={`decision-${field}`}
                    className="text-sm font-semibold text-ink-100"
                  >
                    {t.decision[labelKey]}
                  </label>
                  <p className="mt-0.5 text-xs text-ink-400">{t.decision[`${labelKey}Desc`]}</p>
                </div>
                <div className="flex items-center gap-2">
                  {current !== null ? (
                    <span className="text-xs text-ink-400">
                      {t.decision.currentCapability}:{' '}
                      <span className="tnum text-ink-200">{formatScore(current, locale)}</span>
                    </span>
                  ) : null}
                  <input
                    id={`decision-${field}-number`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={value[field]}
                    disabled={disabled}
                    onChange={(e) => setField(field, Number(e.target.value))}
                    aria-label={`${t.decision[labelKey]} (0-100)`}
                    className="tnum w-16 rounded-md border border-ink-600 bg-ink-950 px-2 py-1 text-right text-sm text-ink-100 disabled:opacity-50"
                  />
                </div>
              </div>
              <input
                id={`decision-${field}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value[field]}
                disabled={disabled}
                onChange={(e) => setField(field, Number(e.target.value))}
                className="mt-2"
                aria-label={t.decision[labelKey]}
              />
            </div>
          );
        })}
      </div>

      {/* Price index — deliberately separate: it is not part of the 100 points */}
      <div className="rounded-lg border border-brand-600/40 bg-brand-500/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <label htmlFor="decision-price" className="text-sm font-semibold text-ink-100">
              {t.decision.priceIndex}
            </label>
            <p className="mt-0.5 max-w-prose text-xs text-ink-400">{t.decision.priceIndexDesc}</p>
          </div>
          <div className="text-right">
            <p className="tnum text-lg font-bold text-brand-400">{value.priceIndex}</p>
            <p className="tnum text-xs text-ink-300">
              {t.decision.estimatedPrice}: {formatMoney(price, locale)}
            </p>
          </div>
        </div>
        <input
          id="decision-price"
          type="range"
          min={config.priceIndexMin}
          max={config.priceIndexMax}
          step={1}
          value={value.priceIndex}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              priceIndex: Math.max(
                config.priceIndexMin,
                Math.min(config.priceIndexMax, Math.round(Number(e.target.value))),
              ),
            })
          }
          className="mt-3"
          style={{ accentColor: seriesColor('player') }}
        />
        <div className="mt-1 flex justify-between text-xs text-ink-500">
          <span>{config.priceIndexMin}</span>
          <span>100</span>
          <span>{config.priceIndexMax}</span>
        </div>
      </div>
    </div>
  );
}

function PresetButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 text-xs text-ink-200 transition hover:border-ink-500 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
