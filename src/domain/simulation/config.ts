import type {
  CompanyKey,
  CompetitorKey,
  DemandWeights,
  Positioning,
  QuarterDecision,
} from './types';

/**
 * Versioned scenario configuration (spec Appendix A, 2.4, 3.3, 7.1, 8.2).
 *
 * EVERY tunable coefficient lives here. Changing a coefficient changes game
 * outcomes, so it requires a new `engineVersion`: completed sessions store the
 * version they were played on and are never recalculated (spec 13.3).
 */

export const SCENARIO_VERSION = 'smartwatch-v1';
export const ENGINE_VERSION = '1.0.0';
export const OFFICIAL_SEED_EXAMPLE = 'smartwatch-v1-2026';

/** Starting capability profile of one company (spec 2.4). */
export interface StartingProfile {
  brandAwareness: number;
  productQuality: number;
  technology: number;
  distribution: number;
  customerExperience: number;
  customerSatisfaction: number;
  cash: number;
}

/** Base rule-based strategy of a benchmark competitor (spec 7.1). */
export interface CompetitorBaseStrategy extends QuarterDecision {
  /** Archetype flags that drive the event adjustments in spec 7.2. */
  fitnessOriented: boolean;
  technologyOriented: boolean;
  valueOriented: boolean;
  premiumOriented: boolean;
  distributionOriented: boolean;
}

export interface CompetitorConfig {
  key: CompetitorKey;
  /** Display name. Benchmark names are educational archetypes, not real market data. */
  displayName: string;
  start: StartingProfile;
  base: CompetitorBaseStrategy;
}

export interface GameConfig {
  scenarioVersion: string;
  engineVersion: string;

  // --- Base market parameters (spec 3.3 / Appendix A) ---
  quarters: number;
  marketUnitsBase: number;
  referencePrice: number;
  strategyPoints: number;
  strategyPointCost: number;
  quarterlyStrategicInvestment: number;
  quarterlyFixedOperatingCost: number;
  playerStartingCash: number;
  priceIndexMin: number;
  priceIndexMax: number;
  randomMin: number;
  randomMax: number;

  // --- Capability growth (spec 5.1) ---
  investmentEffectRate: number;
  investmentDiminishingBase: number;
  capabilityMax: number;

  // --- Brand awareness (spec 5.2) ---
  brandCarryOver: number;
  brandMarketingCoefficient: number;
  brandCsatCoefficient: number;
  /**
   * Engine decision (spec is silent): brand awareness uses the CSAT recomputed
   * from this quarter's capabilities rather than last quarter's value, so a
   * quarter's investment shows up in brand in the same quarter.
   */
  brandUsesNewCsat: boolean;

  // --- Marketing strength (spec 5.3) ---
  marketingStrengthMultiplier: number;

  // --- Price attractiveness (spec 5.4) ---
  priceAttractivenessBase: number;
  priceAttractivenessSlope: number;
  priceAttractivenessPivot: number;
  priceAttractivenessMin: number;
  priceAttractivenessMax: number;

  // --- Product attractiveness (spec 5.5) ---
  productAttractivenessWeights: {
    productQuality: number;
    technology: number;
    brandAwareness: number;
    customerExperience: number;
  };

  // --- Demand weights, default / price-sensitive / shopping peak (spec 5.6, 6) ---
  defaultDemandWeights: DemandWeights;
  priceSensitiveDemandWeights: DemandWeights;
  shoppingPeakDemandWeights: DemandWeights;

  // --- Distribution constraint (spec 5.8) ---
  fulfilmentBase: number;
  fulfilmentSlope: number;
  fulfilmentMin: number;
  fulfilmentMax: number;

  // --- Conversion (spec 5.9) ---
  conversionBase: number;
  conversionTechnologyCoefficient: number;
  conversionCxCoefficient: number;

  // --- Unit cost (spec 5.10) ---
  unitCostBase: number;
  unitCostProductCoefficient: number;
  unitCostTechnologyCoefficient: number;

  // --- Returns (spec 5.11) ---
  returnRateBase: number;
  returnRateProductCoefficient: number;
  returnRateCxCoefficient: number;
  returnRateMin: number;
  returnRateMax: number;
  returnCostShare: number;

  // --- Customer satisfaction (spec 5.12) ---
  csatBase: number;
  csatWeights: {
    productQuality: number;
    technology: number;
    distribution: number;
    customerExperience: number;
    priceAttractiveness: number;
  };

  // --- Scoring (spec 8.2) ---
  scoreWeights: {
    profit: number;
    marketShare: number;
    brand: number;
    csat: number;
    innovation: number;
  };
  profitScoreBase: number;
  profitScoreDivisor: number;
  marketShareScoreMultiplier: number;

  /** Metric used to rank the six companies within a single quarter (spec 8.1). */
  quarterlyRankBy: 'marketShare' | 'netProfit' | 'revenue';

  // --- AI competitor adaptation (spec 7.2) ---
  ai: {
    marketShareDropThresholdPoints: number;
    marketingBoostOnShareDrop: number;
    csatThreshold: number;
    cxBoostOnLowCsat: number;
    priceIndexBumpOnNegativeMargin: number;
    eventBoost: number;
    valuePriceCutOnPriceEvent: number;
    seededAdjustmentRange: number;
  };

  playerStart: StartingProfile;
  competitors: CompetitorConfig[];

  /**
   * Positioning has NO automatic gameplay bonus (spec 3.2). It is recorded for
   * onboarding and compared against actual behaviour in the final report; this
   * map only says which decision pattern each positioning claims.
   */
  positioningExpectation: Record<Positioning, Partial<AverageExpectation>>;
}

export interface AverageExpectation {
  /** Average marketing points expected to be high. */
  marketingHigh: boolean;
  productTechHigh: boolean;
  cxHigh: boolean;
  priceLow: boolean;
  priceHigh: boolean;
}

const DEFAULT_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.3,
  price: 0.2,
  brand: 0.2,
  marketing: 0.15,
  distribution: 0.1,
  cx: 0.05,
};

/** Q3 Price Competition and Q4 Economic Slowdown weights (spec 6). */
const PRICE_SENSITIVE_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.25,
  price: 0.3,
  brand: 0.15,
  marketing: 0.15,
  distribution: 0.1,
  cx: 0.05,
};

/** Q6 Online Shopping Peak weights (spec 6). */
const SHOPPING_PEAK_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.25,
  price: 0.2,
  brand: 0.2,
  marketing: 0.15,
  distribution: 0.15,
  cx: 0.05,
};

/**
 * Starting CSAT for the five benchmark competitors.
 *
 * The spec only fixes the player's starting CSAT (65). Rather than invent magic
 * numbers for the competitors, these values are the output of the spec 5.12 CSAT
 * formula applied to each competitor's own starting stats and base price index,
 * rounded to two decimals. They are written out literally so the engine stays
 * reproducible even if the CSAT formula is later versioned.
 */
const COMPETITOR_START_CSAT = {
  apple: 88.54,
  garmin: 84.26,
  samsung: 85.11,
  huawei: 84.1,
  pixel: 82.22,
} as const;

const STARTING_CASH = 5_000_000;

const COMPETITORS: CompetitorConfig[] = [
  {
    key: 'apple',
    displayName: 'Apple Watch benchmark',
    start: {
      brandAwareness: 90,
      productQuality: 88,
      technology: 92,
      distribution: 90,
      customerExperience: 88,
      customerSatisfaction: COMPETITOR_START_CSAT.apple,
      cash: STARTING_CASH,
    },
    base: {
      productPoints: 25,
      technologyPoints: 30,
      marketingPoints: 20,
      distributionPoints: 10,
      cxPoints: 15,
      priceIndex: 115,
      fitnessOriented: false,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: true,
      distributionOriented: false,
    },
  },
  {
    key: 'garmin',
    displayName: 'Garmin benchmark',
    start: {
      brandAwareness: 75,
      productQuality: 92,
      technology: 88,
      distribution: 72,
      customerExperience: 78,
      customerSatisfaction: COMPETITOR_START_CSAT.garmin,
      cash: STARTING_CASH,
    },
    base: {
      productPoints: 35,
      technologyPoints: 30,
      marketingPoints: 10,
      distributionPoints: 10,
      cxPoints: 15,
      priceIndex: 110,
      fitnessOriented: true,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: true,
      distributionOriented: false,
    },
  },
  {
    key: 'samsung',
    displayName: 'Samsung Galaxy Watch benchmark',
    start: {
      brandAwareness: 85,
      productQuality: 82,
      technology: 88,
      distribution: 88,
      customerExperience: 75,
      customerSatisfaction: COMPETITOR_START_CSAT.samsung,
      cash: STARTING_CASH,
    },
    base: {
      productPoints: 20,
      technologyPoints: 30,
      marketingPoints: 25,
      distributionPoints: 15,
      cxPoints: 10,
      priceIndex: 100,
      fitnessOriented: false,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: false,
      distributionOriented: true,
    },
  },
  {
    key: 'huawei',
    displayName: 'Huawei Watch benchmark',
    start: {
      brandAwareness: 78,
      productQuality: 84,
      technology: 80,
      distribution: 82,
      customerExperience: 72,
      customerSatisfaction: COMPETITOR_START_CSAT.huawei,
      cash: STARTING_CASH,
    },
    base: {
      productPoints: 25,
      technologyPoints: 20,
      marketingPoints: 20,
      distributionPoints: 20,
      cxPoints: 15,
      priceIndex: 90,
      fitnessOriented: false,
      technologyOriented: false,
      valueOriented: true,
      premiumOriented: false,
      distributionOriented: true,
    },
  },
  {
    key: 'pixel',
    displayName: 'Pixel Watch / Fitbit benchmark',
    start: {
      brandAwareness: 70,
      productQuality: 78,
      technology: 86,
      distribution: 68,
      customerExperience: 82,
      customerSatisfaction: COMPETITOR_START_CSAT.pixel,
      cash: STARTING_CASH,
    },
    base: {
      productPoints: 20,
      technologyPoints: 30,
      marketingPoints: 15,
      distributionPoints: 10,
      cxPoints: 25,
      priceIndex: 105,
      fitnessOriented: true,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: false,
      distributionOriented: false,
    },
  },
];

export const smartwatchV1Config: GameConfig = {
  scenarioVersion: SCENARIO_VERSION,
  engineVersion: ENGINE_VERSION,

  quarters: 6,
  marketUnitsBase: 500_000,
  referencePrice: 300,
  strategyPoints: 100,
  strategyPointCost: 20_000,
  quarterlyStrategicInvestment: 2_000_000,
  quarterlyFixedOperatingCost: 2_000_000,
  playerStartingCash: STARTING_CASH,
  priceIndexMin: 80,
  priceIndexMax: 120,
  randomMin: 0.98,
  randomMax: 1.02,

  investmentEffectRate: 0.3,
  investmentDiminishingBase: 120,
  capabilityMax: 100,

  brandCarryOver: 0.95,
  brandMarketingCoefficient: 0.25,
  brandCsatCoefficient: 0.03,
  brandUsesNewCsat: true,

  marketingStrengthMultiplier: 2,

  priceAttractivenessBase: 100,
  priceAttractivenessSlope: 1.5,
  priceAttractivenessPivot: 85,
  priceAttractivenessMin: 40,
  priceAttractivenessMax: 100,

  productAttractivenessWeights: {
    productQuality: 0.35,
    technology: 0.3,
    brandAwareness: 0.2,
    customerExperience: 0.15,
  },

  defaultDemandWeights: DEFAULT_DEMAND_WEIGHTS,
  priceSensitiveDemandWeights: PRICE_SENSITIVE_DEMAND_WEIGHTS,
  shoppingPeakDemandWeights: SHOPPING_PEAK_DEMAND_WEIGHTS,

  fulfilmentBase: 0.7,
  fulfilmentSlope: 0.003,
  fulfilmentMin: 0.7,
  fulfilmentMax: 1.0,

  conversionBase: 0.9,
  conversionTechnologyCoefficient: 0.0005,
  conversionCxCoefficient: 0.0005,

  unitCostBase: 150,
  unitCostProductCoefficient: 0.2,
  unitCostTechnologyCoefficient: 0.1,

  returnRateBase: 0.1,
  returnRateProductCoefficient: 0.0003,
  returnRateCxCoefficient: 0.0003,
  returnRateMin: 0.04,
  returnRateMax: 0.1,
  returnCostShare: 0.25,

  csatBase: 20,
  csatWeights: {
    productQuality: 0.2,
    technology: 0.12,
    distribution: 0.15,
    customerExperience: 0.25,
    priceAttractiveness: 0.08,
  },

  scoreWeights: {
    profit: 0.3,
    marketShare: 0.25,
    brand: 0.15,
    csat: 0.15,
    innovation: 0.15,
  },
  profitScoreBase: 50,
  profitScoreDivisor: 500_000,
  marketShareScoreMultiplier: 3,

  quarterlyRankBy: 'marketShare',

  ai: {
    marketShareDropThresholdPoints: 2,
    marketingBoostOnShareDrop: 5,
    csatThreshold: 65,
    cxBoostOnLowCsat: 5,
    priceIndexBumpOnNegativeMargin: 3,
    eventBoost: 5,
    valuePriceCutOnPriceEvent: 4,
    seededAdjustmentRange: 2,
  },

  playerStart: {
    brandAwareness: 30,
    productQuality: 50,
    technology: 50,
    distribution: 40,
    customerExperience: 50,
    customerSatisfaction: 65,
    cash: STARTING_CASH,
  },

  competitors: COMPETITORS,

  positioningExpectation: {
    AFFORDABLE: { priceLow: true },
    FITNESS: { productTechHigh: true },
    PREMIUM: { priceHigh: true, productTechHigh: true },
    TECHNOLOGY: { productTechHigh: true },
    LIFESTYLE: { marketingHigh: true },
    BALANCED: {},
  },
};

export const CHALLENGER_SCENARIO_VERSION = 'smartwatch-v1-challenger';

/**
 * Optional alternative scenario: identical engine, formulas and coefficients —
 * only the player's starting row differs.
 *
 * Why it exists. With the spec 2.4 starting values, a sweep of every fixed
 * allocation (95,634 combinations, step 5, all price indexes) showed the player
 * finishes 6th of 6 on Final Score in EVERY case: the five benchmark brands
 * start 30-40 points ahead on four capabilities and also invest 100 points a
 * quarter, so the brand / CSAT / innovation dimensions (45% of the score) cannot
 * be caught within six quarters. The class leaderboard still grades well (a
 * 32-point spread between the best and worst player strategies), but the
 * six-company game rank shown every quarter is then a constant.
 *
 * In this scenario the player is a well-funded challenger rather than a startup,
 * which makes the game rank responsive to skill: best play reaches rank 3,
 * a naive even split still finishes 6th. Instructors choose the scenario per
 * assignment; `smartwatch-v1` remains the default so official results match the
 * specification document exactly.
 */
export const smartwatchV1ChallengerConfig: GameConfig = {
  ...smartwatchV1Config,
  scenarioVersion: CHALLENGER_SCENARIO_VERSION,
  playerStart: {
    brandAwareness: 50,
    productQuality: 75,
    technology: 75,
    distribution: 65,
    customerExperience: 75,
    customerSatisfaction: 65,
    cash: STARTING_CASH,
  },
};

/** Registry of scenario configurations, keyed by scenario version. */
export const gameConfigs: Record<string, GameConfig> = {
  [SCENARIO_VERSION]: smartwatchV1Config,
  [CHALLENGER_SCENARIO_VERSION]: smartwatchV1ChallengerConfig,
};

/** Scenario versions an instructor may pick when creating an assignment. */
export const SELECTABLE_SCENARIO_VERSIONS: readonly string[] = [
  SCENARIO_VERSION,
  CHALLENGER_SCENARIO_VERSION,
] as const;

export function getGameConfig(scenarioVersion: string = SCENARIO_VERSION): GameConfig {
  const config = gameConfigs[scenarioVersion];
  if (!config) {
    throw new Error(`Unknown scenario version: ${scenarioVersion}`);
  }
  return config;
}

/** Display names used for the ranking table and competitor intelligence. */
export function competitorDisplayName(key: CompanyKey, config: GameConfig): string | null {
  return config.competitors.find((c) => c.key === key)?.displayName ?? null;
}
