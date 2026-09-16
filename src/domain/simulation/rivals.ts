import { getGameConfig, type GameConfig } from './config';
import { round } from './formulas';
import type {
  CompanyKey,
  CompanyQuarterResult,
  CompetitorIntel,
  IntelKey,
  MarketEvent,
} from './types';

/**
 * Reading the competition, from published information only.
 *
 * This replaces the Golden Strategy in group mode. That button works in solo
 * play because the five rivals are rule-based and their decisions are already
 * fixed by the seed; against five people the answer does not exist yet. What
 * DOES exist is the record of what everyone did last quarter, and reading it is
 * the skill the mode is there to teach.
 *
 * WHAT COUNTS AS PUBLISHED. Everything here is derived from two sources, both
 * of which a student can already see with their own eyes:
 *
 *   - the qualitative intelligence lines on the result screen;
 *   - the ranking table: share, units, revenue, profit, satisfaction, rank.
 *
 * Average price is included in that second list, because `revenue / units` is
 * arithmetic — a real market publishes prices, and so does this one. The five
 * INVESTMENT ALLOCATIONS are never an input here, because a student cannot see
 * them and advice built on them would be advice they could not reproduce.
 *
 * PURE and rule-based, like the rest of the coach: dictionary keys out, no
 * prose, so an instructor can reproduce every sentence.
 */

/** Rivals showing the same move before it counts as a pattern rather than noise. */
const CROWD = 3;
/** Rivals innovating before it counts as a race. */
const RACE = 2;
/** Share gap, in points, below which the field counts as tight. */
const TIGHT_FIELD_POINTS = 0.03;
/** A leader holding this multiple of your share is pulling away. */
const LEADER_MULTIPLE = 1.5;
/** A demand weight this far above the default counts as elevated this quarter. */
const WEIGHT_LIFT = 0.02;

/** At most this many notes, so the panel stays readable. */
const MAX_NOTES = 4;

export type RivalNoteKey =
  | 'manyCutPrice'
  | 'manyRaisedPrice'
  | 'marketingCrowded'
  | 'innovationRace'
  | 'distributionGap'
  | 'cxGap'
  | 'leaderPulling'
  | 'youLead'
  | 'packTight'
  | 'botSeats'
  | 'quietQuarter';

export interface RivalNote {
  key: RivalNoteKey;
  values: Record<string, string | number>;
}

/** One company on the positioning map: price against perceived quality. */
export interface PositionPoint {
  seatKey: CompanyKey;
  companyName: string;
  /** Average selling price last quarter, `revenue / units`. */
  price: number;
  /** Customer satisfaction, the published proxy for perceived quality. */
  customerSatisfaction: number;
  marketShare: number;
  isYou: boolean;
  isBot: boolean;
}

/** Average price actually achieved, or null when nothing was sold. */
function impliedPrice(result: CompanyQuarterResult): number | null {
  return result.unitsSold > 0 ? result.revenue / result.unitsSold : null;
}

/**
 * Where the six companies sit on price against perceived quality.
 *
 * Both axes come from the ranking table a student has already seen. The point
 * of the picture is to show where the field is crowded and where it is empty —
 * the single most useful thing to know before committing a quarter.
 */
export function positioningMap(
  results: CompanyQuarterResult[],
  viewerSeat: CompanyKey,
  botSeats: CompanyKey[],
): PositionPoint[] {
  return results
    .map((result) => {
      const price = impliedPrice(result);
      if (price === null) return null;
      return {
        seatKey: result.companyKey,
        companyName: result.companyName,
        price: round(price, 2),
        customerSatisfaction: result.customerSatisfaction,
        marketShare: result.marketShare,
        isYou: result.companyKey === viewerSeat,
        isBot: botSeats.includes(result.companyKey),
      } satisfies PositionPoint;
    })
    .filter((point): point is PositionPoint => point !== null);
}

/**
 * What the last quarter says about the coming one.
 *
 * Returns at most four notes in a fixed priority order, so the same situation
 * always produces the same reading.
 */
export function readRivals(input: {
  viewerSeat: CompanyKey;
  /** The last played quarter, or null before the first one has run. */
  lastQuarter: {
    intel: CompetitorIntel[];
    results: CompanyQuarterResult[];
  } | null;
  /** The event of the quarter about to be played. */
  event: MarketEvent;
  botSeats: CompanyKey[];
  config?: GameConfig;
}): RivalNote[] {
  const config = input.config ?? getGameConfig();
  const notes: RivalNote[] = [];

  if (input.botSeats.length > 0) {
    // Worth saying plainly: a bot plays a fixed archetype, so it is the one
    // rival whose behaviour a student CAN predict.
    notes.push({ key: 'botSeats', values: { count: input.botSeats.length } });
  }

  if (!input.lastQuarter) {
    notes.push({ key: 'quietQuarter', values: {} });
    return notes.slice(0, MAX_NOTES);
  }

  const { intel, results } = input.lastQuarter;
  const countIntel = (...keys: IntelKey[]) =>
    intel.filter((line) => keys.includes(line.key)).length;

  // --- price ---------------------------------------------------------------
  const cutters = countIntel('aggressivePricing');
  const premium = countIntel('premiumPricing');
  const priceMatters = input.event.weights.price >= config.defaultDemandWeights.price + WEIGHT_LIFT;

  if (cutters >= CROWD) {
    notes.push({
      key: 'manyCutPrice',
      values: { count: cutters, price: Math.round(input.event.weights.price * 100) },
    });
  } else if (premium >= CROWD && priceMatters) {
    notes.push({
      key: 'manyRaisedPrice',
      values: { count: premium, price: Math.round(input.event.weights.price * 100) },
    });
  }

  // --- crowded and empty channels ------------------------------------------
  const marketers = countIntel('marketingPush');
  if (marketers >= CROWD) {
    notes.push({ key: 'marketingCrowded', values: { count: marketers } });
  }

  const innovators = countIntel('productInnovation', 'technologyPush');
  if (innovators >= RACE) {
    notes.push({ key: 'innovationRace', values: { count: innovators } });
  }

  const distributionLift =
    input.event.weights.distribution >= config.defaultDemandWeights.distribution + WEIGHT_LIFT;
  if (countIntel('distributionPush') === 0 && distributionLift) {
    notes.push({
      key: 'distributionGap',
      values: { weight: Math.round(input.event.weights.distribution * 100) },
    });
  }

  if (countIntel('healthCxFocus') === 0) {
    notes.push({ key: 'cxGap', values: {} });
  }

  // --- the standings -------------------------------------------------------
  const you = results.find((r) => r.companyKey === input.viewerSeat);
  if (you) {
    const shares = results.map((r) => r.marketShare);
    const spread = Math.max(...shares) - Math.min(...shares);
    const leader = results.reduce((best, r) => (r.marketShare > best.marketShare ? r : best));

    if (leader.companyKey === input.viewerSeat) {
      notes.push({ key: 'youLead', values: { share: round(you.marketShare * 100, 1) } });
    } else if (you.marketShare > 0 && leader.marketShare >= you.marketShare * LEADER_MULTIPLE) {
      notes.push({
        key: 'leaderPulling',
        values: {
          company: leader.companyName,
          share: round(leader.marketShare * 100, 1),
          yours: round(you.marketShare * 100, 1),
        },
      });
    } else if (spread <= TIGHT_FIELD_POINTS) {
      notes.push({ key: 'packTight', values: { value: round(spread * 100, 1) } });
    }
  }

  if (notes.length === 0) notes.push({ key: 'quietQuarter', values: {} });
  return notes.slice(0, MAX_NOTES);
}
