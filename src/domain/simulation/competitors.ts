import { getGameConfig, type CompetitorConfig, type GameConfig } from './config';
import { clamp } from './formulas';
import { deriveSeed, seededIntegerInRange } from './random';
import { INVESTMENT_FIELDS } from './types';
import type {
  CompanyKey,
  CompetitorIntel,
  CompetitorProfileKey,
  IntelKey,
  InvestmentField,
  MarketEvent,
  QuarterDecision,
} from './types';

/**
 * Computer competitor logic (spec 7).
 *
 * Deterministic and rule-based on purpose: no generative AI. Official simulation
 * has to be fast, free, reproducible and explainable to a student, and an LLM is
 * none of those things.
 *
 *   AIDecision = BaseStrategy + EventAdjustment + PerformanceAdjustment
 *                + SmallSeededAdjustment   (then normalised back to exactly 100)
 */

/** What a competitor knows about its own recent performance. */
export interface CompetitorContext {
  /** Market share (0-1) in the quarter just finished, or null in Q1. */
  previousMarketShare: number | null;
  /** Market share (0-1) two quarters ago, or null before Q3. */
  marketShareTwoQuartersAgo: number | null;
  /** CSAT after the quarter just finished, or null in Q1. */
  previousCsat: number | null;
  /** Net profit margin of the quarter just finished, or null in Q1. */
  previousNetProfitMargin: number | null;
}

export const EMPTY_COMPETITOR_CONTEXT: CompetitorContext = {
  previousMarketShare: null,
  marketShareTwoQuartersAgo: null,
  previousCsat: null,
  previousNetProfitMargin: null,
};

type PointMap = Record<InvestmentField, number>;

function toPointMap(decision: QuarterDecision): PointMap {
  return {
    productPoints: decision.productPoints,
    technologyPoints: decision.technologyPoints,
    marketingPoints: decision.marketingPoints,
    distributionPoints: decision.distributionPoints,
    cxPoints: decision.cxPoints,
  };
}

/**
 * Scales non-negative integer point values so they sum to exactly `total`.
 *
 * Uses the largest-remainder method with a deterministic tie-break on field
 * order, so the same inputs always produce the same allocation. Without this,
 * "add +5 marketing" would silently break the "exactly 100 points" rule.
 */
export function normalizePoints(points: PointMap, total: number): PointMap {
  const fields = INVESTMENT_FIELDS;
  const safe = fields.map((field) => Math.max(0, points[field]));
  const sum = safe.reduce((a, b) => a + b, 0);

  if (sum === 0) {
    // Degenerate input: spread evenly, remainder to the first fields.
    const base = Math.floor(total / fields.length);
    const remainder = total - base * fields.length;
    const result = {} as PointMap;
    fields.forEach((field, i) => {
      result[field] = base + (i < remainder ? 1 : 0);
    });
    return result;
  }

  const scaled = safe.map((value) => (value * total) / sum);
  const floored = scaled.map((value) => Math.floor(value));
  let assigned = floored.reduce((a, b) => a + b, 0);

  // Distribute the remaining points to the largest fractional parts.
  const order = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => (b.fraction === a.fraction ? a.index - b.index : b.fraction - a.fraction));

  let cursor = 0;
  while (assigned < total && order.length > 0) {
    const entry = order[cursor % order.length];
    if (entry) {
      floored[entry.index] = (floored[entry.index] ?? 0) + 1;
      assigned += 1;
    }
    cursor += 1;
  }

  const result = {} as PointMap;
  fields.forEach((field, i) => {
    result[field] = floored[i] ?? 0;
  });
  return result;
}

/**
 * The competitor's weakest-priority investment area: the one it invests least in
 * by base strategy. Used when a negative margin forces a cut (spec 7.2).
 */
export function weakestPriorityField(base: QuarterDecision): InvestmentField {
  let weakest: InvestmentField = INVESTMENT_FIELDS[0];
  let weakestValue = base[weakest];
  for (const field of INVESTMENT_FIELDS) {
    if (base[field] < weakestValue) {
      weakest = field;
      weakestValue = base[field];
    }
  }
  return weakest;
}

/** Event adjustment per spec 7.2, keyed on the competitor's archetype flags. */
function applyEventAdjustment(
  points: PointMap,
  priceIndex: number,
  competitor: CompetitorConfig,
  event: MarketEvent,
  config: GameConfig,
): { points: PointMap; priceIndex: number } {
  const boost = config.ai.eventBoost;
  const next: PointMap = { ...points };
  let nextPrice = priceIndex;
  const { base } = competitor;

  switch (event.key) {
    case 'FITNESS_HEALTH_BOOM':
      // Garmin and technology/product-oriented competitors add Product/Technology.
      if (base.fitnessOriented) next.productPoints += boost;
      if (base.technologyOriented) next.technologyPoints += boost;
      break;

    case 'PRICE_COMPETITION':
    case 'ECONOMIC_SLOWDOWN':
      // Value-oriented competitors may cut price within the allowed bounds.
      if (base.valueOriented) nextPrice -= config.ai.valuePriceCutOnPriceEvent;
      break;

    case 'AI_SMARTWATCH_FEATURES':
      if (base.technologyOriented) next.technologyPoints += boost;
      break;

    case 'ONLINE_SHOPPING_PEAK':
      // Add marketing and/or distribution based on archetype.
      if (base.distributionOriented) next.distributionPoints += boost;
      else next.marketingPoints += boost;
      if (base.premiumOriented) next.marketingPoints += boost;
      break;

    case 'NORMAL_MARKET':
      break;
  }

  return { points: next, priceIndex: nextPrice };
}

/** Performance adjustment per spec 7.2. */
function applyPerformanceAdjustment(
  points: PointMap,
  priceIndex: number,
  competitor: CompetitorConfig,
  context: CompetitorContext,
  config: GameConfig,
): { points: PointMap; priceIndex: number } {
  const next: PointMap = { ...points };
  let nextPrice = priceIndex;
  const { ai } = config;

  // Market share fell by more than 2 percentage points: push marketing.
  if (context.previousMarketShare !== null && context.marketShareTwoQuartersAgo !== null) {
    const dropInPoints =
      (context.marketShareTwoQuartersAgo - context.previousMarketShare) * 100;
    if (dropInPoints > ai.marketShareDropThresholdPoints) {
      next.marketingPoints += ai.marketingBoostOnShareDrop;
    }
  }

  // Customers are unhappy: push customer experience.
  if (context.previousCsat !== null && context.previousCsat < ai.csatThreshold) {
    next.cxPoints += ai.cxBoostOnLowCsat;
  }

  // Losing money: raise price and cut the weakest-priority area.
  if (context.previousNetProfitMargin !== null && context.previousNetProfitMargin < 0) {
    nextPrice += ai.priceIndexBumpOnNegativeMargin;
    const weakest = weakestPriorityField(competitor.base);
    next[weakest] = Math.max(0, next[weakest] - ai.eventBoost);
  }

  return { points: next, priceIndex: nextPrice };
}

/** Optional small seeded adjustment of +/-2 points per area (spec 7.2). */
function applySeededAdjustment(
  points: PointMap,
  competitorKey: CompetitorProfileKey,
  quarter: number,
  masterSeed: string,
  config: GameConfig,
): PointMap {
  const range = config.ai.seededAdjustmentRange;
  if (range <= 0) return points;

  const next: PointMap = { ...points };
  for (const field of INVESTMENT_FIELDS) {
    const seed = deriveSeed(masterSeed, quarter, `ai:${competitorKey}:${field}`);
    next[field] = Math.max(0, next[field] + seededIntegerInRange(seed, range));
  }
  return next;
}

/**
 * Generates one benchmark competitor's decision for a quarter.
 * Always returns a valid decision: five integers summing to exactly 100 and a
 * price index inside the configured bounds.
 */
export function generateCompetitorDecision(
  competitor: CompetitorConfig,
  quarter: number,
  event: MarketEvent,
  context: CompetitorContext,
  masterSeed: string,
  config: GameConfig = getGameConfig(),
): QuarterDecision {
  const base = toPointMap(competitor.base);

  const afterEvent = applyEventAdjustment(
    base,
    competitor.base.priceIndex,
    competitor,
    event,
    config,
  );
  const afterPerformance = applyPerformanceAdjustment(
    afterEvent.points,
    afterEvent.priceIndex,
    competitor,
    context,
    config,
  );
  const jittered = applySeededAdjustment(
    afterPerformance.points,
    competitor.key,
    quarter,
    masterSeed,
    config,
  );

  const normalized = normalizePoints(jittered, config.strategyPoints);

  return {
    ...normalized,
    priceIndex: Math.round(
      clamp(afterPerformance.priceIndex, config.priceIndexMin, config.priceIndexMax),
    ),
  };
}

/** Generates decisions for all five benchmark competitors in one quarter. */
export function generateAllCompetitorDecisions(
  quarter: number,
  event: MarketEvent,
  contexts: Partial<Record<CompetitorProfileKey, CompetitorContext>>,
  masterSeed: string,
  config: GameConfig = getGameConfig(),
): Record<CompanyKey, QuarterDecision> {
  const decisions = {} as Record<CompanyKey, QuarterDecision>;
  for (const competitor of config.competitors) {
    decisions[competitor.key] = generateCompetitorDecision(
      competitor,
      quarter,
      event,
      contexts[competitor.key] ?? EMPTY_COMPETITOR_CONTEXT,
      masterSeed,
      config,
    );
  }
  return decisions;
}

// ---------------------------------------------------------------------------
// 7.3 Competitor intelligence
// ---------------------------------------------------------------------------

/**
 * Turns a competitor's decision into ONE qualitative sentence key.
 *
 * Exact point allocations are never derived from this: the student only ever
 * sees the resulting sentence, while the precise decisions stay available to
 * instructors, admins and the internal simulation test mode (spec 7.3).
 */
export function competitorIntelKey(
  competitor: CompetitorConfig,
  decision: QuarterDecision,
  previousDecision: QuarterDecision | null,
): IntelKey {
  return decisionIntelKey(decision, previousDecision, competitor.base.signatureIntel);
}

/**
 * The same rule with the standing characteristic supplied by the caller.
 *
 * Split out for group matches, where the rival is a classmate rather than an
 * archetype and so has no signature behaviour to fall back on — there the
 * fallback is `steady`, which says only that nothing moved. Keeping ONE
 * implementation of the movement rules means a student cannot learn more about
 * a human rival than they could about a benchmark one.
 */
export function decisionIntelKey(
  decision: QuarterDecision,
  previousDecision: QuarterDecision | null,
  fallback: IntelKey,
): IntelKey {
  const priceDelta = previousDecision ? decision.priceIndex - previousDecision.priceIndex : 0;
  const marketingDelta = previousDecision
    ? decision.marketingPoints - previousDecision.marketingPoints
    : 0;
  const distributionDelta = previousDecision
    ? decision.distributionPoints - previousDecision.distributionPoints
    : 0;
  const productDelta = previousDecision
    ? decision.productPoints - previousDecision.productPoints
    : 0;
  const technologyDelta = previousDecision
    ? decision.technologyPoints - previousDecision.technologyPoints
    : 0;

  // Movements first: a change is more interesting to a student than a steady state.
  if (priceDelta <= -3) return 'aggressivePricing';
  if (productDelta >= 4) return 'productInnovation';
  if (technologyDelta >= 4) return 'technologyPush';
  if (marketingDelta >= 4) return 'marketingPush';
  if (distributionDelta >= 4) return 'distributionPush';

  // Nothing moved this quarter: report the standing characteristic. For a
  // benchmark that is its archetype, distinct per competitor (spec 7.3's five
  // example lines); for a human rival it is simply `steady`.
  return fallback;
}

/** Builds the intelligence summary shown on the quarter result screen. */
export function buildCompetitorIntel(
  decisions: Record<string, QuarterDecision>,
  previousDecisions: Record<string, QuarterDecision> | null,
  config: GameConfig = getGameConfig(),
): CompetitorIntel[] {
  const intel: CompetitorIntel[] = [];
  for (const competitor of config.competitors) {
    const decision = decisions[competitor.key];
    if (!decision) continue;
    intel.push({
      companyKey: competitor.key,
      companyName: competitor.displayName,
      key: competitorIntelKey(competitor, decision, previousDecisions?.[competitor.key] ?? null),
    });
  }
  return intel;
}
