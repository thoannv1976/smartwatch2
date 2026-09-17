import { round } from './formulas';
import type { GameConfig } from './config';
import type {
  CompanyQuarterResult,
  DemandWeights,
  MarketEventKey,
  QuarterDecision,
} from './types';

/**
 * The market, told as something that happened to people.
 *
 * WHY THIS EXISTS. A quarter currently arrives as twelve stat tiles and a
 * ranking table. Everything a student needs is in there, and almost nothing
 * about it feels like a market. A CSAT of 58 is a number; "I waited three weeks
 * for delivery" is a consequence — and a student who has read the second one
 * remembers what distribution is for.
 *
 * ALL THREE ARE PURE AND DERIVED. Nothing here is stored, nothing is generated
 * by a language model, and nothing is random beyond what the engine already
 * decided. Each function reads the same figures the result page shows and
 * returns dictionary keys plus values, exactly like `advice.ts` — so both
 * languages stay in step and the whole thing is unit-testable.
 *
 * ON TONE. The board letter shifts with performance, and that is the one thing
 * in this file that could do harm: a letter written with contempt would push a
 * struggling student out of the exercise altogether. The rule followed
 * throughout is **hard on the numbers, never hard on the person** — name the
 * problem, name one thing to do about it next quarter, and stop. No sarcasm, no
 * verdict on the student, and never a sentence whose point is that they are bad
 * at this.
 */

// -- thresholds --------------------------------------------------------------

/** A share move worth a headline, in share points. */
const SHARE_MOVE = 0.02;
/** A margin at or below this is thin enough to lead with. */
const THIN_MARGIN = 0.05;
/** CSAT at or below this is a problem customers will say out loud. */
const WEAK_CSAT = 58;
/** CSAT at or above this earns genuine praise. */
const STRONG_CSAT = 72;
/** Return rate at or above this shows up as complaints about quality. */
const HIGH_RETURNS = 0.12;
/** Share of potential demand lost to distribution before customers notice. */
const STOCKOUT_SHARE = 0.08;
/** Price this far above the reference reads as premium to a buyer. */
const PREMIUM_PRICE_INDEX = 108;
/** …and this far below reads as cheap. */
const VALUE_PRICE_INDEX = 94;

/** At most this many headlines per quarter. Two is a front page, five is noise. */
const MAX_HEADLINES = 2;
/** Customer reviews shown per quarter. */
const MAX_VOICES = 3;
/** Never fewer than this: one review on its own reads like a loading failure. */
const MIN_VOICES = 2;

export type PressKey =
  | 'shareSurge'
  | 'shareSlide'
  | 'profitRecord'
  | 'profitLoss'
  | 'thinMargin'
  | 'stockout'
  | 'satisfactionPraise'
  | 'satisfactionProblem'
  | 'tookTheLead'
  | 'lostTheLead'
  | 'quietQuarter';

export type PressTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface PressHeadline {
  key: PressKey;
  tone: PressTone;
  values: Record<string, string | number>;
}

export type VoiceKey =
  | 'lovesQuality'
  | 'lovesValue'
  | 'lovesService'
  | 'waitedForStock'
  | 'tooExpensive'
  | 'qualityComplaint'
  | 'serviceComplaint'
  | 'neverHeardOfIt'
  | 'solidChoice'
  | 'averageExperience';

export interface CustomerVoice {
  key: VoiceKey;
  /** 1-5, so the block reads like a review page rather than a report. */
  stars: number;
  values: Record<string, string | number>;
}

export type BoardKey =
  | 'delighted'
  | 'pleased'
  | 'watchful'
  | 'concerned'
  | 'alarmed'
  | 'cashCrisis';

export interface BoardLetter {
  key: BoardKey;
  tone: PressTone;
  /** One concrete thing to do next quarter. Never more than one. */
  adviceKey: BoardAdviceKey;
  values: Record<string, string | number>;
}

export type BoardAdviceKey =
  | 'fixDistribution'
  | 'fixSatisfaction'
  | 'fixMargin'
  | 'buildBrand'
  | 'defendShare'
  | 'protectCash'
  | 'keepGoing';

/** Everything the three generators need about one quarter. */
export interface PressFacts {
  companyName: string;
  quarter: number;
  eventKey: MarketEventKey;
  weights: DemandWeights;
  decision: QuarterDecision;
  result: CompanyQuarterResult;
  previous: CompanyQuarterResult | null;
  config: GameConfig;
}

// -- headlines ---------------------------------------------------------------

/**
 * Up to two press headlines about the student's OWN company.
 *
 * Candidates are generated in priority order and the strongest two survive, the
 * same shape as `reviewQuarter`: a page that leads with "market share up 4
 * points" while the company is losing money would be teaching the wrong lesson,
 * so losses and stockouts outrank good news.
 */
export function pressHeadlines(facts: PressFacts): PressHeadline[] {
  const { result, previous, companyName } = facts;
  const candidates: PressHeadline[] = [];

  const shareMove = previous ? result.marketShare - previous.marketShare : 0;
  const sharePoints = round(Math.abs(shareMove) * 100, 1);

  // Bad news first: a student must not read a celebration over a loss.
  if (result.netProfit < 0) {
    candidates.push({
      key: 'profitLoss',
      tone: 'bad',
      values: { company: companyName, loss: Math.abs(Math.round(result.netProfit)) },
    });
  }

  const lostShare = result.intermediates.potentialUnits
    ? result.intermediates.unfulfilledUnits / result.intermediates.potentialUnits
    : 0;
  if (lostShare >= STOCKOUT_SHARE) {
    candidates.push({
      key: 'stockout',
      tone: 'warn',
      values: {
        company: companyName,
        units: Math.round(result.intermediates.unfulfilledUnits),
        percent: round(lostShare * 100, 1),
      },
    });
  }

  if (result.customerSatisfaction <= WEAK_CSAT) {
    candidates.push({
      key: 'satisfactionProblem',
      tone: 'warn',
      values: { company: companyName, csat: round(result.customerSatisfaction, 1) },
    });
  }

  if (result.netProfit > 0 && result.netProfitMargin <= THIN_MARGIN) {
    candidates.push({
      key: 'thinMargin',
      tone: 'warn',
      values: { company: companyName, margin: round(result.netProfitMargin * 100, 1) },
    });
  }

  if (previous && result.rank === 1 && previous.rank !== 1) {
    candidates.push({
      key: 'tookTheLead',
      tone: 'good',
      values: { company: companyName, from: previous.rank },
    });
  }
  if (previous && previous.rank === 1 && result.rank !== 1) {
    candidates.push({
      key: 'lostTheLead',
      tone: 'warn',
      values: { company: companyName, to: result.rank },
    });
  }

  if (shareMove >= SHARE_MOVE) {
    candidates.push({
      key: 'shareSurge',
      tone: 'good',
      values: {
        company: companyName,
        points: sharePoints,
        share: round(result.marketShare * 100, 1),
      },
    });
  }
  if (shareMove <= -SHARE_MOVE) {
    candidates.push({
      key: 'shareSlide',
      tone: 'warn',
      values: {
        company: companyName,
        points: sharePoints,
        share: round(result.marketShare * 100, 1),
      },
    });
  }

  if (previous && result.netProfit > previous.netProfit && result.netProfit > 0) {
    candidates.push({
      key: 'profitRecord',
      tone: 'good',
      values: { company: companyName, profit: Math.round(result.netProfit) },
    });
  }

  if (result.customerSatisfaction >= STRONG_CSAT) {
    candidates.push({
      key: 'satisfactionPraise',
      tone: 'good',
      values: { company: companyName, csat: round(result.customerSatisfaction, 1) },
    });
  }

  if (candidates.length === 0) {
    return [{ key: 'quietQuarter', tone: 'neutral', values: { company: companyName } }];
  }

  return candidates.slice(0, MAX_HEADLINES);
}

// -- customer voices ---------------------------------------------------------

/**
 * Two or three simulated reviews, derived from the numbers a buyer would feel.
 *
 * Price against brand, satisfaction, the return rate, and whether the company
 * could actually deliver. Every complaint here maps onto exactly one lever the
 * student controls, which is the point: this is the same feedback as the KPI
 * tiles, written as the consequence a person experienced.
 */
export function customerVoices(facts: PressFacts): CustomerVoice[] {
  const { result, decision, config } = facts;
  const candidates: CustomerVoice[] = [];

  const lostShare = result.intermediates.potentialUnits
    ? result.intermediates.unfulfilledUnits / result.intermediates.potentialUnits
    : 0;

  if (lostShare >= STOCKOUT_SHARE) {
    candidates.push({
      key: 'waitedForStock',
      stars: 3,
      values: { percent: round(lostShare * 100, 0) },
    });
  }

  if (result.intermediates.returnRate >= HIGH_RETURNS) {
    candidates.push({
      key: 'qualityComplaint',
      stars: 2,
      values: { rate: round(result.intermediates.returnRate * 100, 1) },
    });
  }

  // Charging a premium the brand has not earned is the classic mistake of this
  // simulation, and the one customers phrase most bluntly.
  if (decision.priceIndex >= PREMIUM_PRICE_INDEX && result.brandAwareness < 55) {
    candidates.push({ key: 'tooExpensive', stars: 2, values: { price: decision.priceIndex } });
  }

  if (result.customerSatisfaction <= WEAK_CSAT) {
    candidates.push({
      key: 'serviceComplaint',
      stars: 2,
      values: { csat: round(result.customerSatisfaction, 1) },
    });
  }

  if (result.brandAwareness < 40) {
    candidates.push({ key: 'neverHeardOfIt', stars: 3, values: {} });
  }

  if (decision.priceIndex <= VALUE_PRICE_INDEX) {
    candidates.push({
      key: 'lovesValue',
      stars: 5,
      values: { price: Math.round(result.actualPrice) },
    });
  }

  if (result.productQuality >= 70 && result.technology >= 70) {
    candidates.push({
      key: 'lovesQuality',
      stars: 5,
      values: { quality: round(result.productQuality, 0) },
    });
  }

  if (result.customerExperience >= 70 || result.customerSatisfaction >= STRONG_CSAT) {
    candidates.push({
      key: 'lovesService',
      stars: 5,
      values: { csat: round(result.customerSatisfaction, 1) },
    });
  }

  // A quarter with no extreme is still a quarter somebody bought a watch in.
  // Padded to MIN_VOICES rather than to one: a lone review reads like the page
  // failed to load, and a company with nothing remarkable about it is exactly
  // the situation a student most needs described back to them.
  const fallbacks: CustomerVoice[] = [
    {
      key: 'solidChoice',
      stars: 4,
      values: { price: Math.round((result.actualPrice / config.referencePrice) * 100) },
    },
    { key: 'averageExperience', stars: 3, values: { csat: round(result.customerSatisfaction, 1) } },
  ];
  for (const fallback of fallbacks) {
    if (candidates.length >= MIN_VOICES) break;
    candidates.push(fallback);
  }

  return candidates.slice(0, MAX_VOICES);
}

// -- the board ---------------------------------------------------------------

/**
 * A letter from the board, once per quarter.
 *
 * Reads the whole tenure so far, not just this quarter, so a bad quarter inside
 * a rising trend is not written up as a crisis. Carries exactly one piece of
 * advice, chosen from the largest single problem on the numbers — a letter with
 * five suggestions is a letter with none.
 */
export function boardLetter(
  facts: PressFacts,
  history: CompanyQuarterResult[],
): BoardLetter {
  const { result, companyName, quarter } = facts;

  const cumulativeProfit = history.reduce((sum, row) => sum + row.netProfit, 0) + result.netProfit;
  const rankTrend = facts.previous ? facts.previous.rank - result.rank : 0;

  const lostShare = result.intermediates.potentialUnits
    ? result.intermediates.unfulfilledUnits / result.intermediates.potentialUnits
    : 0;

  // The single largest problem decides the advice. Ordered by how much damage
  // it is doing right now, not by how easy it is to fix.
  const adviceKey: BoardAdviceKey =
    result.cash < 0
      ? 'protectCash'
      : lostShare >= STOCKOUT_SHARE
        ? 'fixDistribution'
        : result.customerSatisfaction <= WEAK_CSAT
          ? 'fixSatisfaction'
          : result.netProfit > 0 && result.netProfitMargin <= THIN_MARGIN
            ? 'fixMargin'
            : result.brandAwareness < 50
              ? 'buildBrand'
              : rankTrend < 0
                ? 'defendShare'
                : 'keepGoing';

  const key: BoardKey =
    result.cash < 0
      ? 'cashCrisis'
      : cumulativeProfit < 0
        ? 'alarmed'
        : result.netProfit < 0
          ? 'concerned'
          : result.rank <= 2 && rankTrend >= 0
            ? 'delighted'
            : result.rank <= 3
              ? 'pleased'
              : 'watchful';

  const tone: PressTone =
    key === 'delighted' || key === 'pleased'
      ? 'good'
      : key === 'watchful'
        ? 'neutral'
        : key === 'concerned'
          ? 'warn'
          : 'bad';

  return {
    key,
    tone,
    adviceKey,
    values: {
      company: companyName,
      quarter,
      rank: result.rank,
      profit: Math.round(result.netProfit),
      cumulativeProfit: Math.round(cumulativeProfit),
      share: round(result.marketShare * 100, 1),
      csat: round(result.customerSatisfaction, 1),
    },
  };
}
