import type {
  CompanyKey,
  CompetitorKey,
  DemandWeights,
  IntelKey,
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
  /**
   * The competitor's standing characteristic, shown when nothing notable
   * changed this quarter. These are the five example lines of spec 7.3, so each
   * archetype reads distinctly instead of two of them both reporting
   * "premium pricing".
   */
  signatureIntel: IntelKey;
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
  qualityLedDemandWeights: DemandWeights;
  serviceLedDemandWeights: DemandWeights;
  brandLedDemandWeights: DemandWeights;
  supplyConstrainedDemandWeights: DemandWeights;
  /**
   * How this scenario picks its six market events.
   *
   * ABSENT MEANS `FIXED`, and that default is load-bearing: every graded
   * scenario must keep the same six events in the same order for ever, or two
   * students' scores stop meaning the same thing. Only a practice scenario
   * opts into `SEEDED_POOL`.
   */
  eventSelection?: 'FIXED' | 'SEEDED_POOL';

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

/**
 * Weights for the extra events in the practice-only pool.
 *
 * Each one is ORDINARY CONFIGURATION: it shifts where demand looks, and adds no
 * formula. That constraint is what keeps every event explainable to a student
 * in a single sentence, and it is why the pool costs nothing to reason about.
 */
const QUALITY_LED_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.4,
  price: 0.15,
  brand: 0.15,
  marketing: 0.1,
  distribution: 0.1,
  cx: 0.1,
};

const SERVICE_LED_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.25,
  price: 0.15,
  brand: 0.15,
  marketing: 0.1,
  distribution: 0.15,
  cx: 0.2,
};

const BRAND_LED_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.25,
  price: 0.15,
  brand: 0.35,
  marketing: 0.15,
  distribution: 0.05,
  cx: 0.05,
};

const SUPPLY_CONSTRAINED_DEMAND_WEIGHTS: DemandWeights = {
  product: 0.25,
  price: 0.2,
  brand: 0.15,
  marketing: 0.1,
  distribution: 0.25,
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

/**
 * The five benchmark rivals, by the real brands they are modelled on.
 *
 * WHY THEY ARE NOT THE DEFAULT. The archetypes were drawn from real products,
 * and naming them makes the exercise land harder in a classroom. But this
 * software is distributed and sold, and putting someone else's trademark in a
 * paid product is a materially different proposition from using it in your own
 * teaching material. So the shipped default is descriptive, and an institution
 * that has decided it is comfortable doing so turns the real names on.
 *
 * NOTHING ELSE CHANGES. Not a coefficient, not a starting row, not a
 * `CompetitorKey` — those keys are written into every stored session, quarter
 * and exported CSV, so renaming them would break saved data and force a
 * `scenarioVersion` bump that makes every already-graded result incomparable.
 * Only the label a human reads is different, so a game played under either
 * setting scores identically.
 */
export const BRAND_DISPLAY_NAMES: Record<CompetitorKey, string> = {
  apple: 'Apple Watch benchmark',
  garmin: 'Garmin benchmark',
  samsung: 'Samsung Galaxy Watch benchmark',
  huawei: 'Huawei Watch benchmark',
  pixel: 'Pixel Watch / Fitbit benchmark',
};

/**
 * Whether this build shows the real brand names.
 *
 * The one `process.env` read in the whole pure domain, and it is deliberate:
 * `NEXT_PUBLIC_*` values are substituted by the bundler at BUILD time, so this
 * is a compile-time constant rather than runtime state, and the domain stays
 * deterministic. Every scenario is already built per institution — the four
 * Firebase values are baked into the image the same way — so this costs no new
 * machinery.
 *
 * It is read once, here, rather than at each call site, so a test can reason
 * about exactly one switch.
 */
export const USE_BRAND_NAMES = process.env.NEXT_PUBLIC_USE_BRAND_NAMES === 'true';

/**
 * Applies the institution's naming choice to a config.
 *
 * Pure and explicit, so the tests can build both variants and prove they are
 * identical apart from the labels.
 */
function brandedIfEnabled(config: GameConfig): GameConfig {
  return USE_BRAND_NAMES ? withBrandNames(config) : config;
}

export function withBrandNames(config: GameConfig): GameConfig {
  return {
    ...config,
    competitors: config.competitors.map((competitor) => ({
      ...competitor,
      displayName: BRAND_DISPLAY_NAMES[competitor.key] ?? competitor.displayName,
    })),
  };
}

const COMPETITORS: CompetitorConfig[] = [
  {
    key: 'apple',
    displayName: 'Premium benchmark',
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
      signatureIntel: 'premiumPricing',      fitnessOriented: false,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: true,
      distributionOriented: false,
    },
  },
  {
    key: 'garmin',
    displayName: 'Sport benchmark',
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
      signatureIntel: 'productInnovation',      fitnessOriented: true,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: true,
      distributionOriented: false,
    },
  },
  {
    key: 'samsung',
    displayName: 'Ecosystem benchmark',
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
      signatureIntel: 'marketingPush',      fitnessOriented: false,
      technologyOriented: true,
      valueOriented: false,
      premiumOriented: false,
      distributionOriented: true,
    },
  },
  {
    key: 'huawei',
    displayName: 'Value benchmark',
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
      signatureIntel: 'aggressivePricing',      fitnessOriented: false,
      technologyOriented: false,
      valueOriented: true,
      premiumOriented: false,
      distributionOriented: true,
    },
  },
  {
    key: 'pixel',
    displayName: 'Technology benchmark',
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
      signatureIntel: 'healthCxFocus',      fitnessOriented: true,
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
  qualityLedDemandWeights: QUALITY_LED_DEMAND_WEIGHTS,
  serviceLedDemandWeights: SERVICE_LED_DEMAND_WEIGHTS,
  brandLedDemandWeights: BRAND_LED_DEMAND_WEIGHTS,
  supplyConstrainedDemandWeights: SUPPLY_CONSTRAINED_DEMAND_WEIGHTS,

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

export const ARENA_SCENARIO_VERSION = 'smartwatch-v1-arena';

/**
 * Starting row shared by ALL SIX companies in the group-competition scenario.
 *
 * Deliberately the spec 2.4 startup profile rather than the challenger's. Six
 * identical startups leave the most room for six quarters of investment to
 * create a difference, which is the whole point of the exercise; six identical
 * well-funded incumbents would all reach the capability ceiling by quarter four
 * and the scores would bunch up.
 */
const ARENA_START: StartingProfile = {
  brandAwareness: 30,
  productQuality: 50,
  technology: 50,
  distribution: 40,
  customerExperience: 50,
  customerSatisfaction: 65,
  cash: STARTING_CASH,
};

/**
 * Group competition (Part 2): six HUMAN players, one per company.
 *
 * WHY THIS SCENARIO HAS TO EXIST. In `smartwatch-v1` the six seats start wildly
 * apart — the player at brand 30 / product 50 / distribution 40, the `apple`
 * seat at 90 / 88 / 90. That asymmetry is the point when five seats are
 * rule-based benchmarks the student is challenging. Put six students in those
 * seats and the match is decided by WHICH SEAT they were given: brand is 15% of
 * the final score on its own, and a 60-point head start cannot be closed in six
 * quarters. So every seat here starts from exactly the same row.
 *
 * Nothing else changes. Not one coefficient, not one formula, and NOT
 * `engineVersion` — this is a new entry in the registry, exactly like the
 * challenger scenario above. Sessions already graded carry their own
 * `scenarioVersion` and are never recomputed, so adding this cannot move a
 * single existing mark.
 *
 * The five `competitors` entries are kept, with their starting rows flattened
 * to `ARENA_START`: a group of fewer than six students leaves seats empty, and
 * an empty seat is driven by that seat's rule-based archetype so the market
 * always has six companies in it. Their display names are neutral (`Bot 2` …)
 * because a student's rival should never appear to be a real brand.
 */
export const smartwatchV1ArenaConfig: GameConfig = {
  ...smartwatchV1Config,
  scenarioVersion: ARENA_SCENARIO_VERSION,
  playerStart: { ...ARENA_START },
  competitors: COMPETITORS.map((competitor, index) => ({
    ...competitor,
    // `Bot 2` upwards: seat 1 is `player`, which is claimed first and is
    // therefore the last seat that can ever be bot-driven.
    displayName: `Bot ${index + 2}`,
    start: { ...ARENA_START },
  })),
};

export const VARIED_SCENARIO_VERSION = 'smartwatch-v1-varied';

/**
 * Practice with a market you have not already memorised.
 *
 * WHY. `getMarketEvent` is a hard-coded `switch (quarter)`: the same six
 * events, in the same order, every single game. That is exactly right for a
 * graded assignment — two students' scores only mean the same thing if they
 * faced the same market — and it means a second practice run teaches almost
 * nothing, because the student already knows quarter five rewards technology.
 *
 * So this scenario draws its six events FROM A POOL, seeded by the session, and
 * is offered for practice only. Same coefficients, same formulas, same
 * `engineVersion`, same starting row: the ONLY difference is which events come
 * up and in what order.
 *
 * Results carry their own `scenarioVersion`, so a practice run here can never
 * be compared with, or contaminate, an official one — the identical mechanism
 * that has protected the challenger scenario since it was added.
 */
export const smartwatchV1VariedConfig: GameConfig = {
  ...smartwatchV1Config,
  scenarioVersion: VARIED_SCENARIO_VERSION,
  eventSelection: 'SEEDED_POOL',
};

/** Registry of scenario configurations, keyed by scenario version. */
export const gameConfigs: Record<string, GameConfig> = {
  // The three SOLO scenarios honour the institution's naming choice.
  [SCENARIO_VERSION]: brandedIfEnabled(smartwatchV1Config),
  [CHALLENGER_SCENARIO_VERSION]: brandedIfEnabled(smartwatchV1ChallengerConfig),
  [VARIED_SCENARIO_VERSION]: brandedIfEnabled(smartwatchV1VariedConfig),
  // The GROUP scenario never does. Its five non-human seats are `Bot 2`…`Bot 6`
  // precisely so a classmate's empty chair is not mistaken for a real company —
  // turning brand names on there would undo that, and it is not what the switch
  // is for.
  [ARENA_SCENARIO_VERSION]: smartwatchV1ArenaConfig,
};

/**
 * Scenario versions an instructor may pick for a SOLO assignment.
 *
 * The arena scenario is deliberately absent: it is balanced for six humans in
 * six identical seats, and offering it for a solo game would mean one student
 * against five rule-based startups — a match nothing in the balance suite
 * covers.
 */
export const SELECTABLE_SCENARIO_VERSIONS: readonly string[] = [
  SCENARIO_VERSION,
  CHALLENGER_SCENARIO_VERSION,
] as const;

/**
 * Scenarios whose six events are drawn rather than fixed.
 *
 * Named so that a screen can warn an instructor before they set one as an
 * official assignment: two students would face different markets and their
 * scores would not be comparable. `PRACTICE_ONLY_SCENARIO_VERSIONS` is the
 * enforcement point; this list is what it is built from.
 */
export const PRACTICE_ONLY_SCENARIO_VERSIONS: readonly string[] = [
  VARIED_SCENARIO_VERSION,
] as const;

/**
 * Scenarios a student may start a PRACTICE game with.
 *
 * A superset of the assignable ones. The varied scenario appears only here, and
 * `SELECTABLE_SCENARIO_VERSIONS` — which is the zod enum the create-assignment
 * action validates against — deliberately does not contain it. An instructor
 * therefore cannot set it as coursework even by editing the request: two
 * students would face different markets, and their marks would not mean the
 * same thing.
 */
export const PRACTICE_SCENARIO_VERSIONS: readonly string[] = [
  SCENARIO_VERSION,
  CHALLENGER_SCENARIO_VERSION,
  VARIED_SCENARIO_VERSION,
] as const;

/**
 * Scenario versions available to a GROUP assignment.
 *
 * One entry today. Kept as a list, and kept separate from the solo list, so the
 * two modes can never accidentally offer each other's scenarios.
 */
export const GROUP_SCENARIO_VERSIONS: readonly string[] = [ARENA_SCENARIO_VERSION] as const;

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
