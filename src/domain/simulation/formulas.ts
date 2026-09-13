import { getGameConfig, type GameConfig } from './config';
import type {
  DemandWeights,
  MarketEvent,
  QuarterDecision,
  DecisionValidationError,
  InvestmentField,
} from './types';
import { INVESTMENT_FIELDS } from './types';

/**
 * Core formulas (spec 5). Each exported function maps to exactly one numbered
 * formula in the specification so a student's question ("why did my CSAT move?")
 * can be answered by pointing at one function.
 *
 * All functions are pure and total: no NaN, no Infinity, no negative units.
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Rounds to a fixed number of decimals to keep stored results stable and readable. */
export function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// 4.1 Strategy point validation / 4.2 price decision
// ---------------------------------------------------------------------------

export function totalInvestmentPoints(decision: QuarterDecision): number {
  return INVESTMENT_FIELDS.reduce((sum, field) => sum + decision[field], 0);
}

/**
 * Validates a decision (spec 4.1, 4.2, 12.1). Returns every violated rule so the
 * UI can show all problems at once. An empty array means the decision is valid.
 */
export function validateDecision(
  decision: QuarterDecision,
  config: GameConfig = getGameConfig(),
): DecisionValidationError[] {
  const errors: DecisionValidationError[] = [];

  const values: number[] = INVESTMENT_FIELDS.map((field: InvestmentField) => decision[field]);
  const allInRange = values.every(
    (value) => Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 100,
  );
  if (!allInRange) errors.push('pointsRange');

  if (totalInvestmentPoints(decision) !== config.strategyPoints) {
    errors.push('pointsNotHundred');
  }

  const { priceIndex } = decision;
  if (
    !Number.isFinite(priceIndex) ||
    !Number.isInteger(priceIndex) ||
    priceIndex < config.priceIndexMin ||
    priceIndex > config.priceIndexMax
  ) {
    errors.push('priceRange');
  }

  return errors;
}

export function isValidDecision(
  decision: QuarterDecision,
  config: GameConfig = getGameConfig(),
): boolean {
  return validateDecision(decision, config).length === 0;
}

/** 4.2 ActualPrice = ReferencePrice x (PriceIndex / 100) */
export function actualPrice(priceIndex: number, config: GameConfig = getGameConfig()): number {
  return round((config.referencePrice * priceIndex) / 100, 2);
}

// ---------------------------------------------------------------------------
// 5.1 Persistent capability improvement
// ---------------------------------------------------------------------------

/**
 * InvestmentEffect = Points x 0.30 x (1 - OldCapability / 120)
 * NewCapability    = min(100, OldCapability + InvestmentEffect)
 *
 * Diminishing returns: the closer a capability is to 100, the less each point buys.
 */
export function improveCapability(
  oldCapability: number,
  points: number,
  config: GameConfig = getGameConfig(),
): number {
  const effect =
    points * config.investmentEffectRate * (1 - oldCapability / config.investmentDiminishingBase);
  // A negative effect would mean the old capability exceeded the diminishing base;
  // clamping keeps capabilities monotonic in investment.
  const newCapability = oldCapability + Math.max(0, effect);
  return round(clamp(newCapability, 0, config.capabilityMax), 4);
}

// ---------------------------------------------------------------------------
// 5.2 Brand awareness
// ---------------------------------------------------------------------------

/** NewBrand = clamp(0.95 x PreviousBrand + 0.25 x MarketingPoints + 0.03 x CSAT, 0, 100) */
export function brandAwareness(
  previousBrand: number,
  marketingPoints: number,
  customerSatisfaction: number,
  config: GameConfig = getGameConfig(),
): number {
  const value =
    config.brandCarryOver * previousBrand +
    config.brandMarketingCoefficient * marketingPoints +
    config.brandCsatCoefficient * customerSatisfaction;
  return round(clamp(value, 0, 100), 4);
}

// ---------------------------------------------------------------------------
// 5.3 Marketing strength
// ---------------------------------------------------------------------------

/** MarketingStrength = min(100, MarketingPoints x 2), then any event multiplier. */
export function marketingStrength(
  marketingPoints: number,
  eventMultiplier = 1,
  config: GameConfig = getGameConfig(),
): number {
  const baseStrength = Math.min(100, marketingPoints * config.marketingStrengthMultiplier);
  return round(Math.max(0, baseStrength * eventMultiplier), 4);
}

// ---------------------------------------------------------------------------
// 5.4 Price attractiveness
// ---------------------------------------------------------------------------

/** PriceAttractiveness = clamp(100 - 1.5 x (PriceIndex - 85), 40, 100) */
export function priceAttractiveness(
  priceIndex: number,
  config: GameConfig = getGameConfig(),
): number {
  const value =
    config.priceAttractivenessBase -
    config.priceAttractivenessSlope * (priceIndex - config.priceAttractivenessPivot);
  return round(
    clamp(value, config.priceAttractivenessMin, config.priceAttractivenessMax),
    4,
  );
}

// ---------------------------------------------------------------------------
// 5.5 Product attractiveness
// ---------------------------------------------------------------------------

/**
 * ProductAttractiveness = 0.35 x ProductQuality + 0.30 x Technology
 *                       + 0.20 x BrandAwareness + 0.15 x CustomerExperience
 *
 * Event multipliers (Q2 fitness boom, Q5 AI wave) scale the Product Quality and
 * Technology *contributions* before the result is clamped to 0-100, exactly as
 * spec 6 requires.
 */
export function productAttractiveness(
  input: {
    productQuality: number;
    technology: number;
    brandAwareness: number;
    customerExperience: number;
  },
  productMultiplier = 1,
  technologyMultiplier = 1,
  config: GameConfig = getGameConfig(),
): number {
  const w = config.productAttractivenessWeights;
  const value =
    w.productQuality * input.productQuality * productMultiplier +
    w.technology * input.technology * technologyMultiplier +
    w.brandAwareness * input.brandAwareness +
    w.customerExperience * input.customerExperience;
  return round(clamp(value, 0, 100), 4);
}

// ---------------------------------------------------------------------------
// 5.6 Customer demand score
// ---------------------------------------------------------------------------

/**
 * DemandScore = 0.30 x ProductAttractiveness + 0.20 x PriceAttractiveness
 *             + 0.20 x BrandAwareness + 0.15 x MarketingStrength
 *             + 0.10 x Distribution + 0.05 x CustomerExperience
 *
 * The weights come from the quarter's market event, so Q3/Q4 become price
 * sensitive and Q6 leans on distribution without touching this formula.
 */
export function demandScore(
  input: {
    productAttractiveness: number;
    priceAttractiveness: number;
    brandAwareness: number;
    marketingStrength: number;
    distribution: number;
    customerExperience: number;
  },
  weights: DemandWeights,
): number {
  const value =
    weights.product * input.productAttractiveness +
    weights.price * input.priceAttractiveness +
    weights.brand * input.brandAwareness +
    weights.marketing * input.marketingStrength +
    weights.distribution * input.distribution +
    weights.cx * input.customerExperience;
  return round(Math.max(0, value), 6);
}

// ---------------------------------------------------------------------------
// 5.8 Distribution constraint / 5.9 conversion
// ---------------------------------------------------------------------------

/** FulfilmentCapacityFactor = clamp(0.70 + 0.003 x Distribution, 0.70, 1.00) */
export function fulfilmentCapacityFactor(
  distribution: number,
  config: GameConfig = getGameConfig(),
): number {
  const value = config.fulfilmentBase + config.fulfilmentSlope * distribution;
  return round(clamp(value, config.fulfilmentMin, config.fulfilmentMax), 6);
}

/** ConversionModifier = 0.90 + 0.0005 x Technology + 0.0005 x CustomerExperience */
export function conversionModifier(
  technology: number,
  customerExperience: number,
  config: GameConfig = getGameConfig(),
): number {
  const value =
    config.conversionBase +
    config.conversionTechnologyCoefficient * technology +
    config.conversionCxCoefficient * customerExperience;
  return round(Math.max(0, value), 6);
}

// ---------------------------------------------------------------------------
// 5.10 Revenue and product cost
// ---------------------------------------------------------------------------

/** UnitProductCost = 150 + 0.20 x ProductQuality + 0.10 x Technology */
export function unitProductCost(
  productQuality: number,
  technology: number,
  config: GameConfig = getGameConfig(),
): number {
  const value =
    config.unitCostBase +
    config.unitCostProductCoefficient * productQuality +
    config.unitCostTechnologyCoefficient * technology;
  return round(Math.max(0, value), 4);
}

// ---------------------------------------------------------------------------
// 5.11 Returns, operating cost and net profit
// ---------------------------------------------------------------------------

/** ReturnRate = clamp(0.10 - 0.0003 x ProductQuality - 0.0003 x CX, 0.04, 0.10) */
export function returnRate(
  productQuality: number,
  customerExperience: number,
  config: GameConfig = getGameConfig(),
): number {
  const value =
    config.returnRateBase -
    config.returnRateProductCoefficient * productQuality -
    config.returnRateCxCoefficient * customerExperience;
  return round(clamp(value, config.returnRateMin, config.returnRateMax), 6);
}

// ---------------------------------------------------------------------------
// 5.12 Customer satisfaction
// ---------------------------------------------------------------------------

/**
 * CSAT = clamp(20 + 0.20 x ProductQuality + 0.12 x Technology + 0.15 x Distribution
 *            + 0.25 x CustomerExperience + 0.08 x PriceAttractiveness, 0, 100)
 */
export function customerSatisfaction(
  input: {
    productQuality: number;
    technology: number;
    distribution: number;
    customerExperience: number;
    priceAttractiveness: number;
  },
  config: GameConfig = getGameConfig(),
): number {
  const w = config.csatWeights;
  const value =
    config.csatBase +
    w.productQuality * input.productQuality +
    w.technology * input.technology +
    w.distribution * input.distribution +
    w.customerExperience * input.customerExperience +
    w.priceAttractiveness * input.priceAttractiveness;
  return round(clamp(value, 0, 100), 4);
}

// ---------------------------------------------------------------------------
// Helpers shared by the engine
// ---------------------------------------------------------------------------

/** Applies the event's contribution multipliers to a company's demand inputs. */
export function eventAdjustedProductAttractiveness(
  input: {
    productQuality: number;
    technology: number;
    brandAwareness: number;
    customerExperience: number;
  },
  event: MarketEvent,
  config: GameConfig = getGameConfig(),
): number {
  return productAttractiveness(
    input,
    event.productContributionMultiplier,
    event.technologyContributionMultiplier,
    config,
  );
}

/** Sum of demand weights, used by tests to assert each event's weights total 1. */
export function sumWeights(weights: DemandWeights): number {
  return round(
    weights.product +
      weights.price +
      weights.brand +
      weights.marketing +
      weights.distribution +
      weights.cx,
    6,
  );
}
