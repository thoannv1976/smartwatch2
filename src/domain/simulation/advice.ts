import { getGameConfig, type GameConfig } from './config';
import { clamp, round } from './formulas';
import { INVESTMENT_FIELDS } from './types';
import type {
  CompanyQuarterResult,
  CompanyState,
  DemandWeights,
  InvestmentField,
  MarketEvent,
  QuarterDecision,
} from './types';

/**
 * The teaching coach: suggestions before a decision, a review after it, and a
 * verdict on the whole six-quarter tenure.
 *
 * PURE and rule-based, exactly like `analysis.ts` — no LLM, no randomness, no
 * I/O. Every function returns dictionary KEYS plus interpolation values, never
 * prose, so the same rule renders in Vietnamese and English and an instructor
 * can reproduce and defend anything the app says to a student.
 *
 * The thresholds below are deliberately the SAME constants the final report
 * already uses (`analysis.ts`). If the coach said "your marketing is heavy" at
 * 30 and the final report said it was not at 34, the two halves of the app
 * would be teaching different things.
 */

// -- shared thresholds (mirrors analysis.ts) ---------------------------------

const AGGRESSIVE_PRICE_INDEX = 95;
const PREMIUM_PRICE_INDEX = 108;
const WEAK_CSAT = 60;
const DISTRIBUTION_BOTTLENECK = 60;
const WEAK_BRAND = 60;

/** A field this low is effectively abandoned for the quarter. */
const STARVED_POINTS = 5;
/**
 * Marketing at or above this is a deliberate push, not background spend. Lower
 * than `analysis.ts`'s MARKETING_HEAVY (35) on purpose: the report is judging a
 * six-quarter average, this is judging one quarter against distribution.
 */
const MARKETING_PUSH = 25;
/** Share-of-demand overlap above which an allocation counts as reading the market. */
const ALIGNED_OVERLAP = 0.85;
/** Overlap below which it counts as fighting the market. */
const MISALIGNED_OVERLAP = 0.65;
/** Market-share moves smaller than this are noise, not a story. */
const SHARE_MOVE_POINTS = 0.005;
/**
 * Share of potential demand lost to distribution capacity that is worth naming.
 *
 * The fulfilment factor is `clamp(0.70 + 0.003 x Distribution, 0.70, 1.00)`, so
 * it only reaches 1.00 at Distribution 100 — in practice EVERY quarter of every
 * game loses some demand. "Unfulfilled units > 0" is therefore not a signal at
 * all. 12% is the loss at Distribution 60, which is exactly the bottleneck
 * threshold the final report already uses.
 */
const MATERIAL_FULFILMENT_LOSS = 0.12;
/** A return rate above this is worth naming on its own. */
const HIGH_RETURN_RATE = 0.08;
/** Net margin in [0, this) is "profitable but barely". */
const THIN_MARGIN = 0.05;

/** At most this many notes per quarter, so the card stays readable. */
const MAX_REVIEW_NOTES = 5;

// -- types -------------------------------------------------------------------

export type SuggestionKey =
  | 'eventRide'
  | 'fixWeakness'
  | 'fulfilFirst'
  | 'valuePlay'
  | 'defendMargin'
  | 'holdCourse'
  | 'balancedStart';

export interface StrategySuggestion {
  key: SuggestionKey;
  decision: QuarterDecision;
  /** Values interpolated into the suggestion's explanation sentence. */
  values: Record<string, string | number>;
}

export type RiskKey =
  | 'marketingAheadOfDistribution'
  | 'distributionCapacityLow'
  | 'premiumWithoutBrand'
  | 'starvedField'
  | 'discountWithNegativeCash'
  | 'cxNeglectedWeakCsat'
  | 'allInOneArea';

export interface RiskWarning {
  key: RiskKey;
  values: Record<string, string | number>;
}

export type ReviewTone = 'good' | 'warn' | 'bad';

export type ReviewKey =
  | 'alignedWithDemand'
  | 'misalignedWithDemand'
  | 'unfulfilledDemand'
  | 'profitPositive'
  | 'profitNegative'
  | 'marginThin'
  | 'shareUp'
  | 'shareDown'
  | 'rankUp'
  | 'rankDown'
  | 'csatUp'
  | 'csatDown'
  | 'cashNegative'
  | 'priceAheadOfBrand'
  | 'returnsHigh'
  | 'steadyQuarter';

export interface ReviewNote {
  key: ReviewKey;
  tone: ReviewTone;
  values: Record<string, string | number>;
}

export type ConsistencyKey = 'STEADY' | 'SHIFTING' | 'ERRATIC';
export type AdaptationKey = 'TRACKED' | 'PARTIAL' | 'IGNORED';
export type TrajectoryKey = 'RISING' | 'FLAT' | 'FALLING';
export type TenureVerdictKey = 'strongTenure' | 'solidTenure' | 'mixedTenure' | 'difficultTenure';

export interface TenureQuarterNote {
  quarter: number;
  note: ReviewNote;
}

export interface TenureReview {
  verdict: TenureVerdictKey;
  consistency: ConsistencyKey;
  /** Mean absolute quarter-over-quarter change across the five investments. */
  consistencySwing: number;
  adaptation: AdaptationKey;
  /** Mean overlap between allocation and the quarter's real demand weights, 0–1. */
  adaptationOverlap: number;
  trajectory: TrajectoryKey;
  /** Quarter with the highest net profit, and the lowest. */
  bestQuarter: number;
  worstQuarter: number;
  /** Market share in the last quarter minus the first, in share points (0–1). */
  shareChange: number;
  quarterNotes: TenureQuarterNote[];
}

/** One stored quarter, reduced to what the coach needs. Keeps this module pure. */
export interface QuarterFacts {
  quarter: number;
  weights: DemandWeights;
  decision: QuarterDecision;
  result: CompanyQuarterResult;
}

// -- allocation helpers ------------------------------------------------------

type Allocation = Record<InvestmentField, number>;

/**
 * Turns arbitrary positive weights into a whole-number allocation that sums to
 * exactly `total` on a `step` grid.
 *
 * Rounding five numbers independently almost never sums back to 100, and a
 * suggestion that does not sum to 100 cannot be submitted — so the remainder is
 * pushed onto the largest field (or taken off it), deterministically.
 */
function allocate(
  weights: Allocation,
  total: number,
  step: number,
  minPerField = 0,
): Allocation {
  const fields = INVESTMENT_FIELDS;
  const floor = minPerField * fields.length;
  const spendable = Math.max(0, total - floor);

  const sum = fields.reduce((acc, f) => acc + Math.max(0, weights[f]), 0);
  const draft = {} as Allocation;

  for (const field of fields) {
    const share = sum > 0 ? Math.max(0, weights[field]) / sum : 1 / fields.length;
    draft[field] = minPerField + Math.round((share * spendable) / step) * step;
  }

  // Fix the remainder on the field that can absorb it without going negative.
  let remainder = total - fields.reduce((acc, f) => acc + draft[f], 0);
  while (remainder !== 0) {
    const ordered = [...fields].sort((a, b) => draft[b] - draft[a]);
    const target = remainder > 0 ? ordered[0] : ordered.find((f) => draft[f] - step >= minPerField);
    if (!target) break; // Cannot be balanced within the floor; leave as is.
    const move = remainder > 0 ? Math.min(step, remainder) : Math.max(-step, remainder);
    draft[target] += move;
    remainder -= move;
  }

  return draft;
}

function toDecision(allocation: Allocation, priceIndex: number, config: GameConfig): QuarterDecision {
  return {
    productPoints: allocation.productPoints,
    technologyPoints: allocation.technologyPoints,
    marketingPoints: allocation.marketingPoints,
    distributionPoints: allocation.distributionPoints,
    cxPoints: allocation.cxPoints,
    priceIndex: Math.round(clamp(priceIndex, config.priceIndexMin, config.priceIndexMax)),
  };
}

/**
 * How much of the quarter's demand weight each investment can actually move.
 *
 * Product and Technology both feed Product Attractiveness, so they share the
 * `product` weight (scaled by that quarter's event multipliers). Brand and
 * price are excluded: no point buys them directly — brand is earned through
 * marketing and satisfaction, and price is the separate index.
 */
function demandPull(event: MarketEvent): Allocation {
  const w = event.weights;
  return {
    productPoints: w.product * event.productContributionMultiplier,
    technologyPoints: w.product * event.technologyContributionMultiplier,
    marketingPoints: w.marketing * event.marketingStrengthMultiplier,
    distributionPoints: w.distribution,
    cxPoints: w.cx,
  };
}

/**
 * Overlap between where the points went and what the market actually valued,
 * on a 0–1 scale (1 = identical shares).
 *
 * Both sides are renormalised over the four investable channels first, so this
 * measures the SHAPE of the allocation, not its size.
 */
export function demandAlignment(decision: QuarterDecision, weights: DemandWeights): number {
  const spend = {
    product: decision.productPoints + decision.technologyPoints,
    marketing: decision.marketingPoints,
    distribution: decision.distributionPoints,
    cx: decision.cxPoints,
  };
  const want = {
    product: weights.product,
    marketing: weights.marketing,
    distribution: weights.distribution,
    cx: weights.cx,
  };

  const spendTotal = Object.values(spend).reduce((a, b) => a + b, 0);
  const wantTotal = Object.values(want).reduce((a, b) => a + b, 0);
  if (spendTotal <= 0 || wantTotal <= 0) return 0;

  const channels = ['product', 'marketing', 'distribution', 'cx'] as const;
  const overlap = channels.reduce(
    (acc, c) => acc + Math.min(spend[c] / spendTotal, want[c] / wantTotal),
    0,
  );
  return round(overlap, 4);
}

/** The channel where the allocation is furthest BELOW what the market wanted. */
function biggestUnderweight(
  decision: QuarterDecision,
  weights: DemandWeights,
): 'product' | 'marketing' | 'distribution' | 'cx' {
  const spend = {
    product: decision.productPoints + decision.technologyPoints,
    marketing: decision.marketingPoints,
    distribution: decision.distributionPoints,
    cx: decision.cxPoints,
  };
  const want = {
    product: weights.product,
    marketing: weights.marketing,
    distribution: weights.distribution,
    cx: weights.cx,
  };
  const spendTotal = Object.values(spend).reduce((a, b) => a + b, 0) || 1;
  const wantTotal = Object.values(want).reduce((a, b) => a + b, 0) || 1;

  const channels = ['product', 'marketing', 'distribution', 'cx'] as const;
  let worst: (typeof channels)[number] = 'product';
  let worstGap = -Infinity;
  for (const c of channels) {
    const gap = want[c] / wantTotal - spend[c] / spendTotal;
    if (gap > worstGap) {
      worstGap = gap;
      worst = c;
    }
  }
  return worst;
}

/** Share of this quarter's potential demand that distribution could not serve. */
function fulfilmentLossShare(result: CompanyQuarterResult): number {
  const potential = result.intermediates.potentialUnits;
  if (potential <= 0) return 0;
  return result.intermediates.unfulfilledUnits / potential;
}

// -- 1. suggestions before the decision --------------------------------------

/**
 * Three named starting points for this quarter's decision.
 *
 * These are HEURISTICS, not the optimum — they encode the reasoning a CEO would
 * apply (read the event, patch the weakest capability, fix last quarter's
 * bottleneck), which is the thing worth learning. The Golden Strategy button is
 * the separate, brute-force answer.
 *
 * Always returns exactly three, in a fixed priority order, so the same
 * situation always produces the same advice.
 */
export function suggestStrategies(
  event: MarketEvent,
  state: CompanyState,
  history: CompanyQuarterResult[],
  previousDecision: QuarterDecision | null,
  config: GameConfig = getGameConfig(),
): StrategySuggestion[] {
  const total = config.strategyPoints;
  const last = history[history.length - 1] ?? null;
  const candidates: StrategySuggestion[] = [];

  // 1. Last quarter's demand was thrown away at the warehouse door. Nothing
  //    else this quarter beats fixing that, so it is offered first.
  const lastLossShare = last ? fulfilmentLossShare(last) : 0;
  if (last && lastLossShare >= MATERIAL_FULFILMENT_LOSS) {
    candidates.push({
      key: 'fulfilFirst',
      decision: toDecision(
        allocate(
          { productPoints: 1, technologyPoints: 1, marketingPoints: 1, distributionPoints: 3.2, cxPoints: 1.6 },
          total,
          5,
          5,
        ),
        100,
        config,
      ),
      values: {
        units: Math.round(last.intermediates.unfulfilledUnits),
        share: round(lastLossShare * 100, 1),
        distribution: Math.round(state.distribution),
      },
    });
  }

  // 2. Ride the event: put the points where this quarter's demand weights and
  //    event multipliers actually pay.
  const pull = demandPull(event);
  const priceSensitive = event.weights.price >= config.defaultDemandWeights.price + 0.05;
  candidates.push({
    key: 'eventRide',
    decision: toDecision(
      allocate(pull, total, 5, 5),
      priceSensitive ? 95 : 100,
      config,
    ),
    values: {
      product: round(event.weights.product * 100, 0),
      price: round(event.weights.price * 100, 0),
      distribution: round(event.weights.distribution * 100, 0),
    },
  });

  // 3. A price-led play, but only when the market is genuinely price sensitive.
  if (priceSensitive) {
    candidates.push({
      key: 'valuePlay',
      decision: toDecision(
        allocate(
          { productPoints: 2, technologyPoints: 1.4, marketingPoints: 2, distributionPoints: 2.4, cxPoints: 1.2 },
          total,
          5,
          5,
        ),
        AGGRESSIVE_PRICE_INDEX - 5,
        config,
      ),
      values: { price: round(event.weights.price * 100, 0) },
    });
  }

  // 4. Patch the two weakest capabilities. Compounding means a capability left
  //    behind early stays behind.
  const capabilities: Record<InvestmentField, number> = {
    productPoints: state.productQuality,
    technologyPoints: state.technology,
    marketingPoints: state.brandAwareness,
    distributionPoints: state.distribution,
    cxPoints: state.customerExperience,
  };
  const weakest = [...INVESTMENT_FIELDS].sort((a, b) => capabilities[a] - capabilities[b]);
  const weakestField = weakest[0] ?? 'productPoints';
  const gapWeights = {} as Allocation;
  for (const field of INVESTMENT_FIELDS) {
    gapWeights[field] = Math.max(1, config.capabilityMax - capabilities[field]);
  }
  candidates.push({
    key: 'fixWeakness',
    decision: toDecision(allocate(gapWeights, total, 5, 5), 100, config),
    values: { area: weakestField, value: Math.round(capabilities[weakestField]) },
  });

  // 5. Margin is bleeding: lift price and lean on the two levers that cut unit
  //    returns (product quality and customer experience).
  if (last && (last.netProfit < 0 || state.cash < 0)) {
    candidates.push({
      key: 'defendMargin',
      decision: toDecision(
        allocate(
          { productPoints: 2.4, technologyPoints: 1.4, marketingPoints: 1, distributionPoints: 1.6, cxPoints: 2.4 },
          total,
          5,
          5,
        ),
        Math.max(100, Math.round(previousDecision?.priceIndex ?? 100) + 5),
        config,
      ),
      values: { profit: Math.round(last.netProfit), cash: Math.round(state.cash) },
    });
  }

  // 6. Keep doing what worked.
  if (previousDecision && last && last.netProfit > 0) {
    candidates.push({
      key: 'holdCourse',
      decision: { ...previousDecision },
      values: { profit: Math.round(last.netProfit), rank: last.rank },
    });
  }

  // 7. Always available, so there are always three.
  const even = Math.floor(total / INVESTMENT_FIELDS.length / 5) * 5;
  candidates.push({
    key: 'balancedStart',
    decision: toDecision(
      allocate(
        {
          productPoints: even,
          technologyPoints: even,
          marketingPoints: even,
          distributionPoints: even,
          cxPoints: even,
        },
        total,
        5,
      ),
      100,
      config,
    ),
    values: {},
  });

  const seen = new Set<SuggestionKey>();
  const picked: StrategySuggestion[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    picked.push(candidate);
    if (picked.length === 3) break;
  }
  return picked;
}

// -- 2. risk warnings before submitting --------------------------------------

/**
 * Risks visible in a decision BEFORE it is committed.
 *
 * Reads only the decision, the company's current capabilities and the previous
 * decisions — deliberately not the previous RESULTS. The capability state
 * already carries what those results did (a quarter that lost demand to
 * distribution is a quarter that ends with low distribution), so taking the
 * history too would only produce two warnings about one problem.
 *
 * Deliberately names the mechanism ("marketing far ahead of distribution
 * usually creates demand you cannot deliver") and never prescribes a number:
 * the student still has to decide. The submit button is NEVER disabled by
 * these — a warning that blocks is a rule, and a rule teaches nothing.
 */
export function riskWarnings(
  decision: QuarterDecision,
  state: CompanyState,
  previousDecisions: QuarterDecision[],
  config: GameConfig = getGameConfig(),
): RiskWarning[] {
  const warnings: RiskWarning[] = [];

  if (
    decision.marketingPoints >= MARKETING_PUSH &&
    decision.marketingPoints >= decision.distributionPoints * 2
  ) {
    warnings.push({
      key: 'marketingAheadOfDistribution',
      values: {
        marketing: decision.marketingPoints,
        distribution: decision.distributionPoints,
      },
    });
  }

  if (state.distribution < DISTRIBUTION_BOTTLENECK && decision.distributionPoints < 15) {
    warnings.push({
      key: 'distributionCapacityLow',
      values: {
        value: Math.round(state.distribution),
        points: decision.distributionPoints,
      },
    });
  }

  if (decision.priceIndex >= PREMIUM_PRICE_INDEX + 2 && state.brandAwareness < WEAK_BRAND) {
    warnings.push({
      key: 'premiumWithoutBrand',
      values: { price: decision.priceIndex, brand: Math.round(state.brandAwareness) },
    });
  }

  // A field starved this quarter AND in both previous quarters. Capability
  // growth compounds, so three quarters at zero is not a choice that can be
  // undone in quarter six.
  const recent = previousDecisions.slice(-2);
  if (recent.length === 2) {
    for (const field of INVESTMENT_FIELDS) {
      const starvedNow = decision[field] <= STARVED_POINTS;
      const starvedBefore = recent.every((d) => d[field] <= STARVED_POINTS);
      if (starvedNow && starvedBefore) {
        warnings.push({ key: 'starvedField', values: { area: field, quarters: 3 } });
        break; // One is the lesson; five is a wall of text.
      }
    }
  }

  if (decision.priceIndex <= AGGRESSIVE_PRICE_INDEX && state.cash < 0) {
    warnings.push({
      key: 'discountWithNegativeCash',
      values: { price: decision.priceIndex, cash: Math.round(state.cash) },
    });
  }

  if (decision.cxPoints < 10 && state.customerSatisfaction < WEAK_CSAT) {
    warnings.push({
      key: 'cxNeglectedWeakCsat',
      values: { points: decision.cxPoints, csat: Math.round(state.customerSatisfaction) },
    });
  }

  const half = config.strategyPoints / 2;
  const heavy = INVESTMENT_FIELDS.find((field) => decision[field] >= half);
  if (heavy) {
    warnings.push({ key: 'allInOneArea', values: { area: heavy, points: decision[heavy] } });
  }

  return warnings;
}

// -- 3. review of one played quarter ----------------------------------------

/**
 * What the quarter's numbers say about the decision that produced them.
 *
 * The first rule is the one worth the most: the student's allocation against
 * the demand weights that were ACTUALLY in force that quarter (stored on the
 * quarter document). That turns "my revenue fell" into "the market paid for
 * distribution this quarter and I bought marketing".
 */
export function reviewQuarter(
  facts: QuarterFacts,
  previousResult: CompanyQuarterResult | null,
): ReviewNote[] {
  const { decision, result, weights } = facts;
  const notes: ReviewNote[] = [];

  const overlap = demandAlignment(decision, weights);
  if (overlap >= ALIGNED_OVERLAP) {
    notes.push({ key: 'alignedWithDemand', tone: 'good', values: { value: Math.round(overlap * 100) } });
  } else if (overlap <= MISALIGNED_OVERLAP) {
    notes.push({
      key: 'misalignedWithDemand',
      tone: 'warn',
      values: { value: Math.round(overlap * 100), area: biggestUnderweight(decision, weights) },
    });
  }

  const lossShare = fulfilmentLossShare(result);
  if (lossShare >= MATERIAL_FULFILMENT_LOSS) {
    notes.push({
      key: 'unfulfilledDemand',
      tone: 'bad',
      values: {
        units: Math.round(result.intermediates.unfulfilledUnits),
        share: round(lossShare * 100, 1),
        distribution: Math.round(result.distribution),
        marketing: decision.marketingPoints,
      },
    });
  }

  if (result.cash < 0) {
    notes.push({ key: 'cashNegative', tone: 'bad', values: { value: Math.round(result.cash) } });
  }

  if (result.netProfit < 0) {
    notes.push({
      key: 'profitNegative',
      tone: 'bad',
      values: { value: Math.round(result.netProfit), margin: round(result.netProfitMargin * 100, 1) },
    });
  } else if (result.netProfitMargin < THIN_MARGIN) {
    notes.push({
      key: 'marginThin',
      tone: 'warn',
      values: { value: round(result.netProfitMargin * 100, 1), price: decision.priceIndex },
    });
  } else {
    notes.push({
      key: 'profitPositive',
      tone: 'good',
      values: { value: Math.round(result.netProfit), margin: round(result.netProfitMargin * 100, 1) },
    });
  }

  if (previousResult) {
    const shareMove = result.marketShare - previousResult.marketShare;
    if (shareMove >= SHARE_MOVE_POINTS) {
      notes.push({
        key: 'shareUp',
        tone: 'good',
        values: { value: round(shareMove * 100, 1), share: round(result.marketShare * 100, 1) },
      });
    } else if (shareMove <= -SHARE_MOVE_POINTS) {
      notes.push({
        key: 'shareDown',
        tone: 'warn',
        values: { value: round(Math.abs(shareMove) * 100, 1), share: round(result.marketShare * 100, 1) },
      });
      if (decision.priceIndex >= PREMIUM_PRICE_INDEX && result.brandAwareness < WEAK_BRAND) {
        notes.push({
          key: 'priceAheadOfBrand',
          tone: 'warn',
          values: { price: decision.priceIndex, brand: Math.round(result.brandAwareness) },
        });
      }
    }

    if (result.rank < previousResult.rank) {
      notes.push({
        key: 'rankUp',
        tone: 'good',
        values: { from: previousResult.rank, to: result.rank },
      });
    } else if (result.rank > previousResult.rank) {
      notes.push({
        key: 'rankDown',
        tone: 'warn',
        values: { from: previousResult.rank, to: result.rank },
      });
    }

    const csatMove = result.customerSatisfaction - previousResult.customerSatisfaction;
    if (csatMove >= 1) {
      notes.push({
        key: 'csatUp',
        tone: 'good',
        values: { value: round(csatMove, 1), csat: Math.round(result.customerSatisfaction) },
      });
    } else if (csatMove <= -1) {
      notes.push({
        key: 'csatDown',
        tone: 'warn',
        values: { value: round(Math.abs(csatMove), 1), csat: Math.round(result.customerSatisfaction) },
      });
    }
  }

  if (result.intermediates.returnRate > HIGH_RETURN_RATE) {
    notes.push({
      key: 'returnsHigh',
      tone: 'warn',
      values: {
        value: round(result.intermediates.returnRate * 100, 1),
        cost: Math.round(result.returnCost),
      },
    });
  }

  if (notes.length === 0) {
    notes.push({
      key: 'steadyQuarter',
      tone: 'good',
      values: { share: round(result.marketShare * 100, 1) },
    });
  }

  // Worst news first: a student who reads only the top line should read the
  // thing that cost them the most.
  const order: Record<ReviewTone, number> = { bad: 0, warn: 1, good: 2 };
  return [...notes]
    .sort((a, b) => order[a.tone] - order[b.tone])
    .slice(0, MAX_REVIEW_NOTES);
}

// -- 4. the whole tenure -----------------------------------------------------

/** Slope of a simple least-squares fit, used only to classify a trend. */
function trend(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * ((values[i] ?? 0) - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * A verdict on all six quarters, on three axes a CEO is actually judged on:
 * did they hold a line (consistency), did they read the market (adaptation),
 * and did the company end better than it started (trajectory).
 *
 * The headline verdict comes from the final score so it can never contradict
 * the grade, and the three axes explain HOW that score was earned.
 */
export function tenureReview(quarters: QuarterFacts[], finalScore: number): TenureReview {
  const ordered = [...quarters].sort((a, b) => a.quarter - b.quarter);

  // Consistency: mean absolute quarter-over-quarter move across the five
  // investments. Zero means the same allocation six times.
  let swingTotal = 0;
  let swingCount = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (!prev || !curr) continue;
    for (const field of INVESTMENT_FIELDS) {
      swingTotal += Math.abs(curr.decision[field] - prev.decision[field]);
      swingCount += 1;
    }
  }
  const consistencySwing = swingCount > 0 ? round(swingTotal / swingCount, 2) : 0;
  const consistency: ConsistencyKey =
    consistencySwing < 5 ? 'STEADY' : consistencySwing < 12 ? 'SHIFTING' : 'ERRATIC';

  // Adaptation: how closely the allocation tracked each quarter's real demand
  // weights. This is the axis the market events are there to test.
  const overlaps = ordered.map((q) => demandAlignment(q.decision, q.weights));
  const adaptationOverlap =
    overlaps.length > 0
      ? round(overlaps.reduce((a, b) => a + b, 0) / overlaps.length, 4)
      : 0;
  const adaptation: AdaptationKey =
    adaptationOverlap >= 0.8 ? 'TRACKED' : adaptationOverlap >= 0.68 ? 'PARTIAL' : 'IGNORED';

  // Trajectory: did profit and share end up going somewhere.
  const profits = ordered.map((q) => q.result.netProfit);
  const shares = ordered.map((q) => q.result.marketShare);
  const profitSlope = trend(profits);
  const shareSlope = trend(shares);
  const scale = Math.max(1, Math.abs(profits[0] ?? 0));
  const rising = profitSlope / scale > 0.05 || shareSlope > 0.002;
  const falling = profitSlope / scale < -0.05 || shareSlope < -0.002;
  const trajectory: TrajectoryKey = rising && !falling ? 'RISING' : falling && !rising ? 'FALLING' : 'FLAT';

  let bestQuarter = ordered[0]?.quarter ?? 1;
  let worstQuarter = ordered[0]?.quarter ?? 1;
  let bestProfit = -Infinity;
  let worstProfit = Infinity;
  for (const q of ordered) {
    if (q.result.netProfit > bestProfit) {
      bestProfit = q.result.netProfit;
      bestQuarter = q.quarter;
    }
    if (q.result.netProfit < worstProfit) {
      worstProfit = q.result.netProfit;
      worstQuarter = q.quarter;
    }
  }

  const firstShare = ordered[0]?.result.marketShare ?? 0;
  const lastShare = ordered[ordered.length - 1]?.result.marketShare ?? 0;

  const verdict: TenureVerdictKey =
    finalScore >= 75
      ? 'strongTenure'
      : finalScore >= 60
        ? 'solidTenure'
        : finalScore >= 45
          ? 'mixedTenure'
          : 'difficultTenure';

  const quarterNotes: TenureQuarterNote[] = ordered.map((q, index) => {
    const previous = index > 0 ? (ordered[index - 1]?.result ?? null) : null;
    const notes = reviewQuarter(q, previous);
    return {
      quarter: q.quarter,
      note: notes[0] ?? { key: 'steadyQuarter', tone: 'good', values: {} },
    };
  });

  return {
    verdict,
    consistency,
    consistencySwing,
    adaptation,
    adaptationOverlap,
    trajectory,
    bestQuarter,
    worstQuarter,
    shareChange: round(lastShare - firstShare, 4),
    quarterNotes,
  };
}

/** Band of a student's position within their class leaderboard. */
export type PercentileBandKey = 'top10' | 'top25' | 'upperHalf' | 'lowerHalf' | 'bottom25';

/** Smallest class in which a percentile can be shown without identifying people. */
export const MIN_CLASS_SIZE_FOR_PERCENTILE = 4;

/**
 * Where a rank sits in a class, as a percentile and a band.
 *
 * Returns null for classes too small to say anything without effectively naming
 * the other students: in a class of three, "you are last" identifies everyone.
 */
export function classPercentile(
  rank: number,
  total: number,
): { percentile: number; band: PercentileBandKey } | null {
  if (total < MIN_CLASS_SIZE_FOR_PERCENTILE || rank < 1 || rank > total) return null;

  // Share of the class this student finished ahead of.
  const ahead = (total - rank) / (total - 1);
  const percentile = Math.round(ahead * 100);

  const band: PercentileBandKey =
    percentile >= 90
      ? 'top10'
      : percentile >= 75
        ? 'top25'
        : percentile >= 50
          ? 'upperHalf'
          : percentile >= 25
            ? 'lowerHalf'
            : 'bottom25';

  return { percentile, band };
}
