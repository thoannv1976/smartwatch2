import { getGameConfig, type GameConfig } from './config';
import type { MarketEvent } from './types';

/**
 * Market events (spec 6).
 *
 * Events are pure configuration: every event only changes market size, demand
 * weights or a contribution multiplier. No formula is ever duplicated, which is
 * what keeps each event explainable to a student in one sentence.
 */
export function getMarketEvent(quarter: number, config: GameConfig = getGameConfig()): MarketEvent {
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
