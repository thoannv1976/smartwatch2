import { round } from './formulas';
import type { CompanyQuarterResult, QuarterForecast } from './types';

/**
 * Calibration: what the student predicted, against what happened.
 *
 * WHY THIS EXISTS. Every other piece of feedback in this app is the system
 * talking to the student — three suggestions, risk warnings, a quarter review,
 * a tenure verdict, the hindsight table. All of it useful, and all of it one
 * direction. A student can finish six quarters having never once committed to a
 * belief about the market, which means they can finish without ever finding out
 * whether they understood it or were simply carried by a lucky allocation.
 *
 * Asking for a predicted rank BEFORE the market runs fixes that for the price
 * of one tap. The prediction cannot change the outcome, so it costs nothing in
 * fairness; and being wrong in a way you named yourself is the most durable
 * lesson the simulation can offer.
 *
 * DELIBERATELY NOT PART OF THE GRADE. Scoring calibration would mean changing
 * `computeGameFinalScores`, which would make every already-graded class
 * incomparable with every future one. It is reported as feedback and exported
 * for the instructor, who can weigh it however they like.
 *
 * Pure, like the rest of this folder: it reads a stored forecast and a stored
 * result, and returns dictionary keys plus values for the i18n layer. No prose.
 */

export type ForecastBandKey = 'sharp' | 'close' | 'loose' | 'unread';

/** A prediction judged against the quarter it was made for. */
export interface ForecastScore {
  quarter: number;
  predictedRank: number;
  actualRank: number;
  /** Signed: negative means the student was more pessimistic than reality. */
  rankError: number;
  /** Absolute rank distance, 0-5. */
  rankGap: number;
  predictedShare: number | null;
  actualShare: number;
  /** Absolute share distance in percentage points, or null if not predicted. */
  shareGapPoints: number | null;
  /** How the miss should be described: exact, under- or over-estimated. */
  direction: 'exact' | 'underestimated' | 'overestimated';
  note: string | null;
}

/** The six-quarter summary shown on the report. */
export interface ForecastAccuracy {
  /** Quarters that carry a prediction. May be fewer than six. */
  predicted: number;
  /** Quarters where the rank was called exactly. */
  exact: number;
  /** Mean absolute rank gap across predicted quarters. */
  averageRankGap: number;
  /** Mean absolute share gap in points, over quarters that predicted a share. */
  averageShareGapPoints: number | null;
  /** 0-100, higher is better. Presentation only — never part of the grade. */
  index: number;
  band: ForecastBandKey;
  quarters: ForecastScore[];
}

/**
 * The worst possible rank miss with six companies.
 *
 * Predicting 1 when you came 6th, or the reverse. Used to normalise the index,
 * so the scale does not depend on how many companies a scenario happens to run.
 */
const MAX_RANK_GAP = 5;

/**
 * Band thresholds on the 0-100 index.
 *
 * `sharp` needs an average miss under half a place, which in practice means
 * calling most quarters exactly. `unread` is reserved for an average miss of
 * more than two places — at that distance the student is not reading the market
 * at all, and the report should say so plainly rather than encouragingly.
 */
const SHARP = 90;
const CLOSE = 70;
const LOOSE = 45;

export function forecastBand(index: number): ForecastBandKey {
  if (index >= SHARP) return 'sharp';
  if (index >= CLOSE) return 'close';
  if (index >= LOOSE) return 'loose';
  return 'unread';
}

/**
 * Judges one prediction.
 *
 * `predictedShare` is optional on purpose — see `ForecastInputs`: requiring two
 * numbers every quarter buys a little more signal at the cost of a lot more
 * friction, and a field most students skip is worse than a field that is
 * honestly optional.
 */
export function scoreForecast(
  forecast: QuarterForecast,
  result: CompanyQuarterResult,
): ForecastScore {
  const actualShare = result.marketShare;
  // Signed the intuitive way round: a student who said "6th" and came 1st
  // UNDERestimated themselves, even though 6 is the larger number.
  const rankError = forecast.predictedRank - result.rank;
  const rankGap = Math.abs(rankError);

  const predictedShare = typeof forecast.predictedShare === 'number' ? forecast.predictedShare : null;
  const shareGapPoints =
    predictedShare === null ? null : round(Math.abs(predictedShare - actualShare) * 100, 1);

  return {
    quarter: result.quarter,
    predictedRank: forecast.predictedRank,
    actualRank: result.rank,
    rankError,
    rankGap,
    predictedShare,
    actualShare,
    shareGapPoints,
    direction: rankGap === 0 ? 'exact' : rankError > 0 ? 'underestimated' : 'overestimated',
    note: forecast.note?.trim() ? forecast.note.trim() : null,
  };
}

/**
 * Summarises a whole tenure's calibration.
 *
 * QUARTERS WITHOUT A PREDICTION ARE SKIPPED, NOT COUNTED AS WRONG. Predictions
 * only started existing partway through this app's life, and a student who
 * played before the field existed — or who used a browser that failed to send
 * it — has done nothing worth penalising. `predicted` reports the denominator
 * so the screen can say what the index is actually based on.
 *
 * Returns null when there is nothing to report, so a caller can hide the card
 * rather than render a zero that looks like a bad mark.
 */
export function forecastAccuracy(
  entries: { forecast: QuarterForecast | null; result: CompanyQuarterResult }[],
): ForecastAccuracy | null {
  const quarters = entries
    .filter(
      (entry): entry is { forecast: QuarterForecast; result: CompanyQuarterResult } =>
        entry.forecast !== null,
    )
    .map((entry) => scoreForecast(entry.forecast, entry.result))
    .sort((a, b) => a.quarter - b.quarter);

  if (quarters.length === 0) return null;

  const totalGap = quarters.reduce((sum, q) => sum + q.rankGap, 0);
  const averageRankGap = totalGap / quarters.length;

  const withShare = quarters.filter((q) => q.shareGapPoints !== null);
  const averageShareGapPoints =
    withShare.length === 0
      ? null
      : round(withShare.reduce((sum, q) => sum + (q.shareGapPoints ?? 0), 0) / withShare.length, 1);

  // Linear in the average miss, which keeps the number explainable to a
  // student in one sentence: every place you are out costs 20 points.
  const index = round(Math.max(0, 100 * (1 - averageRankGap / MAX_RANK_GAP)), 1);

  return {
    predicted: quarters.length,
    exact: quarters.filter((q) => q.rankGap === 0).length,
    averageRankGap: round(averageRankGap, 2),
    averageShareGapPoints,
    index,
    band: forecastBand(index),
    quarters,
  };
}

/** Longest a reasoning note may be. Enforced again by the zod schema. */
export const FORECAST_NOTE_MAX = 200;

/**
 * True for a forecast that is safe to store.
 *
 * The rank must name one of the companies actually in the market, and a
 * predicted share must be a real fraction. Validated here as well as in the
 * action so the domain cannot be handed nonsense by a future caller.
 */
export function isValidForecast(forecast: QuarterForecast, companyCount: number): boolean {
  if (!Number.isInteger(forecast.predictedRank)) return false;
  if (forecast.predictedRank < 1 || forecast.predictedRank > companyCount) return false;

  if (forecast.predictedShare !== undefined && forecast.predictedShare !== null) {
    if (!Number.isFinite(forecast.predictedShare)) return false;
    if (forecast.predictedShare < 0 || forecast.predictedShare > 1) return false;
  }

  if (forecast.note !== undefined && forecast.note !== null) {
    if (forecast.note.length > FORECAST_NOTE_MAX) return false;
  }

  return true;
}
