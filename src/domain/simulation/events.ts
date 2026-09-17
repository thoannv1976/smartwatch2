import { getGameConfig, type GameConfig } from './config';
import { seededUnit } from './random';
import type { MarketEvent, MarketEventKey } from './types';

/**
 * Market events (spec 6).
 *
 * Events are pure configuration: every event only changes market size, demand
 * weights or a contribution multiplier. No formula is ever duplicated, which is
 * what keeps each event explainable to a student in one sentence.
 */
export function getMarketEvent(
  quarter: number,
  config: GameConfig = getGameConfig(),
  /**
   * The session seed. REQUIRED for a scenario that draws its events, ignored
   * by every graded one.
   */
  seed?: string,
): MarketEvent {
  if (config.eventSelection === 'SEEDED_POOL') {
    // Deliberately a throw rather than a fallback to the fixed six. A silent
    // fallback would let one caller render "AI features" on the decision screen
    // while the engine simulated a different event entirely — a wrong market
    // that looks completely normal, which is the worst failure this file has.
    if (!seed) {
      throw new Error(
        `Scenario ${config.scenarioVersion} draws its events and needs a seed; none was given`,
      );
    }
    return getSeededMarketEvent(quarter, seed, config);
  }

  const base = {
    quarter,
    marketUnits: config.marketUnitsBase,
    weights: config.defaultDemandWeights,
    productContributionMultiplier: 1,
    technologyContributionMultiplier: 1,
    marketingStrengthMultiplier: 1,
  };

  switch (quarter) {
    case 1:
      // Normal Market: no modifier.
      return { ...base, key: 'NORMAL_MARKET' };

    case 2:
      // Fitness & Health Boom: Product Quality and Technology contributions x1.20.
      return {
        ...base,
        key: 'FITNESS_HEALTH_BOOM',
        productContributionMultiplier: 1.2,
        technologyContributionMultiplier: 1.2,
      };

    case 3:
      // Price Competition: price-sensitive demand weights.
      return {
        ...base,
        key: 'PRICE_COMPETITION',
        weights: config.priceSensitiveDemandWeights,
      };

    case 4:
      // Economic Slowdown: market -15%, still price sensitive.
      return {
        ...base,
        key: 'ECONOMIC_SLOWDOWN',
        marketUnits: Math.round(config.marketUnitsBase * 0.85),
        weights: config.priceSensitiveDemandWeights,
      };

    case 5:
      // AI Smartwatch Features: Technology contribution x1.40, market back to base.
      return {
        ...base,
        key: 'AI_SMARTWATCH_FEATURES',
        technologyContributionMultiplier: 1.4,
      };

    case 6:
      // Online Shopping Peak: market +20%, marketing x1.15, distribution matters more.
      return {
        ...base,
        key: 'ONLINE_SHOPPING_PEAK',
        marketUnits: Math.round(config.marketUnitsBase * 1.2),
        weights: config.shoppingPeakDemandWeights,
        marketingStrengthMultiplier: 1.15,
      };

    default:
      throw new Error(`No market event configured for quarter ${quarter}`);
  }
}

/** Every event in quarter order — used by the internal simulation test page. */
export function getAllMarketEvents(config: GameConfig = getGameConfig()): MarketEvent[] {
  return Array.from({ length: config.quarters }, (_, i) => getMarketEvent(i + 1, config));
}

// -- the practice pool -------------------------------------------------------

/**
 * Extra events, drawn only by a scenario with `eventSelection: 'SEEDED_POOL'`.
 *
 * Every one is ORDINARY CONFIGURATION, like the fixed six: market size, demand
 * weights, or one contribution multiplier. No event adds a formula, which is
 * what keeps each of them explainable to a student in one sentence and keeps
 * the pool from quietly becoming a second engine.
 *
 * Each also has a clear counter-strategy, so drawing it makes the quarter a
 * different problem rather than a different amount of luck.
 */
const POOL_EVENT_KEYS: readonly MarketEventKey[] = [
  'NORMAL_MARKET',
  'FITNESS_HEALTH_BOOM',
  'PRICE_COMPETITION',
  'ECONOMIC_SLOWDOWN',
  'AI_SMARTWATCH_FEATURES',
  'ONLINE_SHOPPING_PEAK',
  'QUALITY_EXPECTATIONS',
  'SERVICE_EXPECTATIONS',
  'BRAND_HYPE',
  'SUPPLY_SHORTAGE',
  'MARKET_EXPANSION',
  'MARKETING_FATIGUE',
] as const;

/** Builds any event key against a config. The one place an event is defined. */
export function buildMarketEvent(
  key: MarketEventKey,
  quarter: number,
  config: GameConfig,
): MarketEvent {
  const base = {
    quarter,
    key,
    marketUnits: config.marketUnitsBase,
    weights: config.defaultDemandWeights,
    productContributionMultiplier: 1,
    technologyContributionMultiplier: 1,
    marketingStrengthMultiplier: 1,
  };

  switch (key) {
    case 'NORMAL_MARKET':
      return base;

    case 'FITNESS_HEALTH_BOOM':
      return { ...base, productContributionMultiplier: 1.2, technologyContributionMultiplier: 1.2 };

    case 'PRICE_COMPETITION':
      return { ...base, weights: config.priceSensitiveDemandWeights };

    case 'ECONOMIC_SLOWDOWN':
      return {
        ...base,
        marketUnits: Math.round(config.marketUnitsBase * 0.85),
        weights: config.priceSensitiveDemandWeights,
      };

    case 'AI_SMARTWATCH_FEATURES':
      return { ...base, technologyContributionMultiplier: 1.4 };

    case 'ONLINE_SHOPPING_PEAK':
      return {
        ...base,
        marketUnits: Math.round(config.marketUnitsBase * 1.2),
        weights: config.shoppingPeakDemandWeights,
        marketingStrengthMultiplier: 1.15,
      };

    // --- pool only, never in a graded scenario ---

    case 'QUALITY_EXPECTATIONS':
      // Reviews raise the bar: buyers weigh the product itself far more.
      return { ...base, weights: config.qualityLedDemandWeights };

    case 'SERVICE_EXPECTATIONS':
      // After-sales becomes the differentiator. Punishes a neglected CX budget.
      return { ...base, weights: config.serviceLedDemandWeights };

    case 'BRAND_HYPE':
      // A viral quarter: name recognition carries the purchase, for once.
      return { ...base, weights: config.brandLedDemandWeights, marketingStrengthMultiplier: 1.1 };

    case 'SUPPLY_SHORTAGE':
      // Components are scarce and the market shrinks; whoever can actually put
      // stock in front of a customer wins it.
      return {
        ...base,
        marketUnits: Math.round(config.marketUnitsBase * 0.9),
        weights: config.supplyConstrainedDemandWeights,
      };

    case 'MARKET_EXPANSION':
      // New buyers enter. More units for everyone, and they do not know the
      // brands yet, so distribution reach matters more than usual.
      return {
        ...base,
        marketUnits: Math.round(config.marketUnitsBase * 1.3),
        weights: config.shoppingPeakDemandWeights,
      };

    case 'MARKETING_FATIGUE':
      // Buyers have stopped listening to advertising. The quarter to have built
      // something real rather than shouted about it.
      return { ...base, marketingStrengthMultiplier: 0.8 };

    default: {
      // Exhaustiveness: a new key added to the type without a case here becomes
      // a compile error rather than a silently neutral quarter.
      const never: never = key;
      throw new Error(`No market event configured for key ${String(never)}`);
    }
  }
}

/**
 * The six events a `SEEDED_POOL` scenario plays, drawn without repeats.
 *
 * Deterministic in the session seed, so the same practice session replays
 * identically — a student who reloads the page must not get a different market,
 * and the whole simulation's reproducibility rests on nothing being drawn at
 * request time.
 *
 * Drawn WITHOUT REPLACEMENT so a run cannot serve the same event three times;
 * six distinct markets is the point of the mode.
 */
export function drawEventKeys(seed: string, count: number): MarketEventKey[] {
  const remaining = [...POOL_EVENT_KEYS];
  const drawn: MarketEventKey[] = [];

  for (let quarter = 1; quarter <= count && remaining.length > 0; quarter += 1) {
    // `seededUnit` rather than `seededIntegerInRange`: the latter returns a
    // value in [-range, range], and folding that onto [0, range) gives a
    // lopsided distribution where the middle of the pool is drawn twice as
    // often as its ends. A uniform unit scaled to what is left is both correct
    // and obviously correct.
    const unit = seededUnit(`${seed}|event|${quarter}`);
    const index = Math.min(remaining.length - 1, Math.floor(unit * remaining.length));
    drawn.push(remaining[index]!);
    remaining.splice(index, 1);
  }

  return drawn;
}

/**
 * The event for one quarter of a scenario that draws from the pool.
 *
 * Separate from `getMarketEvent` because the fixed path must stay exactly as it
 * was: a graded scenario resolves its event from the quarter number alone, with
 * no seed involved anywhere.
 */
export function getSeededMarketEvent(
  quarter: number,
  seed: string,
  config: GameConfig = getGameConfig(),
): MarketEvent {
  const keys = drawEventKeys(seed, config.quarters);
  const key = keys[quarter - 1];
  if (!key) throw new Error(`No market event drawn for quarter ${quarter}`);
  return buildMarketEvent(key, quarter, config);
}
