import { demandAlignment } from './advice';
import { round } from './formulas';
import type { GameConfig } from './config';
import type {
  CompanyFinalScore,
  CompanyQuarterResult,
  DemandWeights,
  MarketEventKey,
  QuarterDecision,
} from './types';

/**
 * What a student earned, beyond the number out of 100.
 *
 * DERIVED AT READ TIME, NEVER STORED. Nothing is written when an achievement is
 * won: the conditions are evaluated from the quarters already on record, every
 * time the report is opened. That buys three things at once — every session
 * played before today earns its badges retroactively, there is no migration and
 * no backfill, and there is no stored flag that can drift out of step with the
 * results it claims to describe.
 *
 * WHAT THEY REWARD. Deliberately not "played six quarters" or "logged in five
 * days". A badge for showing up teaches showing up. Every condition here names
 * something a CEO actually did — recovering from a bad start, funding growth
 * without running the cash negative, reading a market event correctly — so that
 * collecting them and learning the material are the same activity.
 *
 * Pure, and returning dictionary keys like the rest of this folder.
 */

export type AchievementKey =
  | 'comeback'
  | 'sustainedProfit'
  | 'marketReader'
  | 'nobodyLeftBehind'
  | 'capitalDiscipline'
  | 'eventSurfer'
  | 'shareLeader'
  | 'innovator'
  | 'brandBuilder'
  | 'steadyHand'
  | 'efficientOperator'
  | 'wireToWire';

/** Rough difficulty, used only to sort and colour the shelf. */
export type AchievementTier = 'gold' | 'silver' | 'bronze';

export interface Achievement {
  key: AchievementKey;
  tier: AchievementTier;
  values: Record<string, string | number>;
}

/** One quarter as the achievement rules read it. */
export interface AchievementQuarter {
  quarter: number;
  eventKey: MarketEventKey;
  weights: DemandWeights;
  decision: QuarterDecision;
  result: CompanyQuarterResult;
}

// -- thresholds --------------------------------------------------------------

/** Started here or worse, to count as a comeback. */
const POOR_START_RANK = 5;
/** …and finished here or better. */
const STRONG_FINISH_RANK = 3;
/** CSAT never allowed below this, for the customer badge. */
const CSAT_FLOOR = 60;
/** Overlap with the quarter's demand weights that counts as reading the market. */
const ALIGNED = 0.8;
/** Calibration index that earns the prediction badge. */
const SHARP_FORECAST = 90;
/** Final capability level that counts as having built something. */
const BUILT = 75;
/** Margin sustained across the tenure that counts as efficient. */
const STRONG_MARGIN = 0.15;
/** Largest quarter-to-quarter swing allowed for a steady tenure, in points. */
const STEADY_SWING = 25;

/** The do-nothing allocation, used as the bar `eventSurfer` must clear. */
const EVEN_SPLIT: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

/**
 * Every badge a finished tenure earned.
 *
 * Returns them best-first so the shelf leads with the hardest thing the student
 * did. An empty array is a perfectly normal outcome and the screen says so
 * rather than inventing a participation badge.
 */
export function awardAchievements(input: {
  quarters: AchievementQuarter[];
  score: CompanyFinalScore;
  config: GameConfig;
  /** From `forecastAccuracy`, when the student made predictions. */
  forecastIndex?: number | null;
}): Achievement[] {
  const { quarters, score, config } = input;
  const earned: Achievement[] = [];

  // A partial tenure earns nothing: every condition below is a statement about
  // six quarters, and judging four of them against the same bar would be wrong
  // in both directions.
  if (quarters.length < config.quarters) return earned;

  const sorted = [...quarters].sort((a, b) => a.quarter - b.quarter);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const results = sorted.map((q) => q.result);

  if (first.result.rank >= POOR_START_RANK && last.result.rank <= STRONG_FINISH_RANK) {
    earned.push({
      key: 'comeback',
      tier: 'gold',
      values: { from: first.result.rank, to: last.result.rank },
    });
  }

  if (results.every((r) => r.rank === 1)) {
    earned.push({ key: 'wireToWire', tier: 'gold', values: {} });
  }

  if (results.every((r) => r.netProfit > 0)) {
    earned.push({
      key: 'sustainedProfit',
      tier: 'gold',
      values: { profit: Math.round(score.cumulativeProfit) },
    });
  }

  if (typeof input.forecastIndex === 'number' && input.forecastIndex >= SHARP_FORECAST) {
    earned.push({
      key: 'marketReader',
      tier: 'gold',
      values: { index: round(input.forecastIndex, 0) },
    });
  }

  // Every quarter whose event actually moved the weights, played in line with
  // them. The quarters with no modifier are excluded: matching a market that
  // did not change is not evidence of reading anything.
  //
  // AND BEATEN THE EVEN SPLIT. Without that second test the badge fired for a
  // student who put 20 points in every box for six quarters and never looked at
  // the market at all — an even allocation scores well against most weight sets
  // simply by touching everything. Rewarding that for "right move, right
  // quarter" would teach the exact opposite of the lesson.
  const eventQuarters = sorted.filter((q) => q.eventKey !== 'NORMAL_MARKET');
  if (
    eventQuarters.length > 0 &&
    eventQuarters.every(
      (q) =>
        demandAlignment(q.decision, q.weights) >= ALIGNED &&
        demandAlignment(q.decision, q.weights) > demandAlignment(EVEN_SPLIT, q.weights),
    )
  ) {
    earned.push({
      key: 'eventSurfer',
      tier: 'gold',
      values: { quarters: eventQuarters.length },
    });
  }

  if (results.every((r) => r.customerSatisfaction >= CSAT_FLOOR)) {
    earned.push({
      key: 'nobodyLeftBehind',
      tier: 'silver',
      values: { floor: round(Math.min(...results.map((r) => r.customerSatisfaction)), 1) },
    });
  }

  if (results.every((r) => r.cash >= 0)) {
    earned.push({
      key: 'capitalDiscipline',
      tier: 'silver',
      values: { cash: Math.round(score.finalCash) },
    });
  }

  if (score.finalMarketShare >= Math.max(...results.map((r) => r.marketShare)) && last.result.rank === 1) {
    earned.push({
      key: 'shareLeader',
      tier: 'silver',
      values: { share: round(score.finalMarketShare * 100, 1) },
    });
  }

  if (score.finalProductQuality >= BUILT && score.finalTechnology >= BUILT) {
    earned.push({
      key: 'innovator',
      tier: 'silver',
      values: {
        quality: round(score.finalProductQuality, 0),
        technology: round(score.finalTechnology, 0),
      },
    });
  }

  if (score.finalBrand >= BUILT) {
    earned.push({
      key: 'brandBuilder',
      tier: 'silver',
      values: { brand: round(score.finalBrand, 0) },
    });
  }

  if (score.finalNetProfitMargin >= STRONG_MARGIN) {
    earned.push({
      key: 'efficientOperator',
      tier: 'bronze',
      values: { margin: round(score.finalNetProfitMargin * 100, 1) },
    });
  }

  // Consistency measured the same way `tenureReview` measures it: the largest
  // single reallocation between consecutive quarters.
  const swings = sorted.slice(1).map((q, index) => {
    const previous = sorted[index]!.decision;
    return (
      Math.abs(q.decision.productPoints - previous.productPoints) +
      Math.abs(q.decision.technologyPoints - previous.technologyPoints) +
      Math.abs(q.decision.marketingPoints - previous.marketingPoints) +
      Math.abs(q.decision.distributionPoints - previous.distributionPoints) +
      Math.abs(q.decision.cxPoints - previous.cxPoints)
    );
  });
  // A steady hand adjusts; it does not freeze. Requiring some movement keeps
  // this from rewarding a student who submitted the identical allocation six
  // times — which is not consistency, it is not playing.
  const largestSwing = swings.length > 0 ? Math.max(...swings) : 0;
  if (swings.length > 0 && largestSwing > 0 && largestSwing <= STEADY_SWING) {
    earned.push({
      key: 'steadyHand',
      tier: 'bronze',
      values: { swing: largestSwing },
    });
  }

  const order: Record<AchievementTier, number> = { gold: 0, silver: 1, bronze: 2 };
  return earned.sort((a, b) => order[a.tier] - order[b.tier]);
}

/** Every badge that exists, for the "what you did not get" half of the shelf. */
export const ALL_ACHIEVEMENTS: readonly AchievementKey[] = [
  'comeback',
  'wireToWire',
  'sustainedProfit',
  'marketReader',
  'eventSurfer',
  'nobodyLeftBehind',
  'capitalDiscipline',
  'shareLeader',
  'innovator',
  'brandBuilder',
  'efficientOperator',
  'steadyHand',
] as const;
