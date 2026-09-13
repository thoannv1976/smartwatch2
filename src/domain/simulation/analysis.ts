import { getGameConfig, type GameConfig } from './config';
import { round } from './formulas';
import { INVESTMENT_FIELDS } from './types';
import type {
  AverageDecision,
  CompanyQuarterResult,
  FinalScoreBreakdown,
  Lesson,
  Positioning,
  QuarterDecision,
  StrategyAnalysis,
  StrategyLabel,
} from './types';

/**
 * Rule-based strategy interpretation and lessons (spec 8.4).
 *
 * No LLM is used: the interpretation is derived from the student's own average
 * decisions and final KPIs, so an instructor can always reproduce and defend it.
 * The functions return dictionary KEYS plus interpolation values, never prose,
 * so the report renders in both Vietnamese and English.
 */

// Thresholds from the spec's worked examples (8.4).
const MARKETING_HEAVY = 35;
const INNOVATION_COMBINED = 55;
const AGGRESSIVE_PRICE_INDEX = 95;
const PREMIUM_PRICE_INDEX = 108;
const STRONG_CSAT = 80;
const WEAK_CSAT = 60;
const DISTRIBUTION_BOTTLENECK = 60;
const CX_POINTS_STRONG = 22;
const DISTRIBUTION_POINTS_LED = 25;
/** Max spread between the five averages that still counts as a balanced allocation. */
const BALANCED_SPREAD = 10;

export function averageDecision(decisions: QuarterDecision[]): AverageDecision {
  if (decisions.length === 0) {
    return {
      productPoints: 0,
      technologyPoints: 0,
      marketingPoints: 0,
      distributionPoints: 0,
      cxPoints: 0,
      priceIndex: 0,
    };
  }
  const n = decisions.length;
  const sum = (pick: (d: QuarterDecision) => number) =>
    round(decisions.reduce((acc, d) => acc + pick(d), 0) / n, 2);

  return {
    productPoints: sum((d) => d.productPoints),
    technologyPoints: sum((d) => d.technologyPoints),
    marketingPoints: sum((d) => d.marketingPoints),
    distributionPoints: sum((d) => d.distributionPoints),
    cxPoints: sum((d) => d.cxPoints),
    priceIndex: sum((d) => d.priceIndex),
  };
}

/** Identifies dominant strategic behaviour from average decisions and outcomes. */
export function strategyLabels(
  averages: AverageDecision,
  breakdown: FinalScoreBreakdown,
): StrategyLabel[] {
  const labels: StrategyLabel[] = [];

  if (averages.marketingPoints > MARKETING_HEAVY) labels.push('ACQUISITION_FOCUS');
  if (averages.productPoints + averages.technologyPoints > INNOVATION_COMBINED) {
    labels.push('INNOVATION_FOCUS');
  }
  if (averages.priceIndex < AGGRESSIVE_PRICE_INDEX) labels.push('AGGRESSIVE_PRICING');
  if (averages.priceIndex >= PREMIUM_PRICE_INDEX) labels.push('PREMIUM_POSITIONING');
  if (breakdown.finalCsat > STRONG_CSAT || averages.cxPoints >= CX_POINTS_STRONG) {
    labels.push('CX_STRENGTH');
  }
  if (averages.distributionPoints >= DISTRIBUTION_POINTS_LED) labels.push('DISTRIBUTION_LED');
  if (breakdown.cumulativeRevenue > 0 && breakdown.cumulativeProfit < 0) {
    labels.push('GROWTH_WITHOUT_PROFIT');
  }

  const values = INVESTMENT_FIELDS.map((field) => averages[field]);
  const spread = Math.max(...values) - Math.min(...values);
  if (labels.length === 0 || spread <= BALANCED_SPREAD) labels.push('BALANCED_STRATEGY');

  return labels;
}

function formatMoney(value: number): string {
  const millions = value / 1_000_000;
  return `${millions >= 0 ? '' : '-'}$${Math.abs(millions).toFixed(2)}M`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Generates the three lessons shown in the final report.
 *
 * Candidates are evaluated in a fixed priority order and the first three that
 * apply are returned, so the same run always produces the same lessons.
 */
export function generateLessons(
  averages: AverageDecision,
  breakdown: FinalScoreBreakdown,
  history: CompanyQuarterResult[],
  positioning: Positioning | null,
  config: GameConfig = getGameConfig(),
): Lesson[] {
  const candidates: Lesson[] = [];
  const last = history[history.length - 1];
  const finalDistribution = last?.distribution ?? 0;
  const productAttractivenessFinal = last?.intermediates.productAttractiveness ?? 0;
  const totalUnfulfilled = history.reduce((sum, r) => sum + r.intermediates.unfulfilledUnits, 0);

  // 1. Growth vs. profitability is the central lesson of the simulation.
  if (breakdown.cumulativeProfit < 0) {
    candidates.push({
      key: 'growthNoProfit',
      values: { value: formatMoney(breakdown.cumulativeProfit) },
    });
  } else {
    candidates.push({
      key: 'profitableGrowth',
      values: { value: formatMoney(breakdown.cumulativeProfit) },
    });
  }

  // 2. Marketing without fulfilment capacity.
  if (averages.marketingPoints > MARKETING_HEAVY && totalUnfulfilled > 0) {
    candidates.push({ key: 'marketingHeavy', values: { value: averages.marketingPoints } });
  }
  // Exhaustive by design: distribution always yields exactly one lesson, which is
  // part of how the report is guaranteed to contain three.
  if (finalDistribution < DISTRIBUTION_BOTTLENECK) {
    candidates.push({
      key: 'distributionBottleneck',
      values: { value: Math.round(finalDistribution) },
    });
  } else {
    candidates.push({
      key: 'distributionStrength',
      values: { value: Math.round(finalDistribution) },
    });
  }

  // 3. Innovation as a cumulative advantage.
  if (averages.productPoints + averages.technologyPoints > INNOVATION_COMBINED) {
    candidates.push({
      key: 'innovationPaid',
      values: { value: Math.round(productAttractivenessFinal) },
    });
  } else if (breakdown.finalProductQuality < 60 && breakdown.finalTechnology < 60) {
    candidates.push({
      key: 'innovationThin',
      values: {
        product: Math.round(breakdown.finalProductQuality),
        tech: Math.round(breakdown.finalTechnology),
      },
    });
  }

  // 4. Pricing.
  if (averages.priceIndex < AGGRESSIVE_PRICE_INDEX) {
    candidates.push({
      key: 'aggressivePricing',
      values: {
        value: averages.priceIndex,
        margin: formatPercent(breakdown.finalNetProfitMargin),
      },
    });
  } else if (averages.priceIndex >= PREMIUM_PRICE_INDEX) {
    candidates.push({ key: 'premiumPricing', values: { value: averages.priceIndex } });
  }

  // 5. Customer experience — also exhaustive.
  if (breakdown.finalCsat > STRONG_CSAT) {
    candidates.push({ key: 'cxStrength', values: { value: Math.round(breakdown.finalCsat) } });
  } else if (breakdown.finalCsat < WEAK_CSAT) {
    candidates.push({ key: 'cxWeak', values: { value: Math.round(breakdown.finalCsat) } });
  } else {
    candidates.push({ key: 'cxMiddling', values: { value: Math.round(breakdown.finalCsat) } });
  }

  // 6. Cash.
  if (breakdown.finalCash < 0) {
    candidates.push({ key: 'negativeCash', values: { value: formatMoney(breakdown.finalCash) } });
  }

  // 7. Positioning consistency.
  const consistent = isPositioningConsistent(averages, positioning, config);
  if (positioning && consistent === false) {
    candidates.push({ key: 'positioningMismatch', values: { positioning } });
  }

  // 8. Fallback so there are always three lessons.
  candidates.push({ key: 'balanced', values: {} });

  const seen = new Set<string>();
  const lessons: Lesson[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    lessons.push(candidate);
    if (lessons.length === 3) break;
  }
  return lessons;
}

/**
 * Checks the student's actual behaviour against the positioning they declared
 * when founding the company. Positioning gives no gameplay bonus (spec 3.2);
 * this is purely a teaching mirror. Returns null when no claim was made.
 */
export function isPositioningConsistent(
  averages: AverageDecision,
  positioning: Positioning | null,
  config: GameConfig = getGameConfig(),
): boolean | null {
  if (!positioning) return null;
  const expectation = config.positioningExpectation[positioning];
  const claims = Object.keys(expectation) as (keyof typeof expectation)[];
  if (claims.length === 0) return null; // BALANCED claims nothing specific.

  const checks: boolean[] = [];
  if (expectation.marketingHigh) checks.push(averages.marketingPoints > MARKETING_HEAVY);
  if (expectation.productTechHigh) {
    checks.push(averages.productPoints + averages.technologyPoints > INNOVATION_COMBINED);
  }
  if (expectation.cxHigh) checks.push(averages.cxPoints >= CX_POINTS_STRONG);
  if (expectation.priceLow) checks.push(averages.priceIndex < AGGRESSIVE_PRICE_INDEX);
  if (expectation.priceHigh) checks.push(averages.priceIndex >= PREMIUM_PRICE_INDEX);

  return checks.length > 0 && checks.every(Boolean);
}

/** Full rule-based analysis for the final report. */
export function analyseStrategy(
  decisions: QuarterDecision[],
  history: CompanyQuarterResult[],
  breakdown: FinalScoreBreakdown,
  positioning: Positioning | null,
  config: GameConfig = getGameConfig(),
): StrategyAnalysis {
  const averages = averageDecision(decisions);
  return {
    averages,
    labels: strategyLabels(averages, breakdown),
    lessons: generateLessons(averages, breakdown, history, positioning, config),
    positioningConsistent: isPositioningConsistent(averages, positioning, config),
  };
}
