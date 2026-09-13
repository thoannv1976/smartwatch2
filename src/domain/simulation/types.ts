/**
 * Domain types for the Smartwatch CEO Challenge simulation.
 *
 * This module (and everything else under `domain/simulation`) is PURE:
 * no database, no network, no React, no authentication. Given the same state,
 * decisions, event and seed it must return exactly the same result.
 *
 * The engine is written around an array of six companies and six decision sets,
 * never around "the human player", so a future 6-player multiplayer version can
 * reuse the same core by swapping AI decision generation for six human submissions.
 */

export type ControllerType = 'PLAYER' | 'AI';

/** Stable identifiers for the six companies inside one game session. */
export const PLAYER_COMPANY_KEY = 'player';

export type CompetitorKey = 'apple' | 'garmin' | 'samsung' | 'huawei' | 'pixel';

export type CompanyKey = typeof PLAYER_COMPANY_KEY | CompetitorKey;

/** Strategic archetype of a benchmark competitor (spec 2.3). */
export type CompetitorProfileKey = CompetitorKey;

export type Positioning =
  | 'AFFORDABLE'
  | 'FITNESS'
  | 'PREMIUM'
  | 'TECHNOLOGY'
  | 'LIFESTYLE'
  | 'BALANCED';

export const POSITIONINGS: readonly Positioning[] = [
  'AFFORDABLE',
  'FITNESS',
  'PREMIUM',
  'TECHNOLOGY',
  'LIFESTYLE',
  'BALANCED',
] as const;

export type MarketEventKey =
  | 'NORMAL_MARKET'
  | 'FITNESS_HEALTH_BOOM'
  | 'PRICE_COMPETITION'
  | 'ECONOMIC_SLOWDOWN'
  | 'AI_SMARTWATCH_FEATURES'
  | 'ONLINE_SHOPPING_PEAK';

/** The six customer choice factors that make up the demand score (spec 2.2 / 5.6). */
export interface DemandWeights {
  product: number;
  price: number;
  brand: number;
  marketing: number;
  distribution: number;
  cx: number;
}

/** Per-quarter market event definition. Events are configuration, never duplicated formulas. */
export interface MarketEvent {
  key: MarketEventKey;
  quarter: number;
  /** Total addressable units this quarter. */
  marketUnits: number;
  /** Demand score weights in effect this quarter. */
  weights: DemandWeights;
  /** Multiplier on the Product Quality contribution inside Product Attractiveness. */
  productContributionMultiplier: number;
  /** Multiplier on the Technology contribution inside Product Attractiveness. */
  technologyContributionMultiplier: number;
  /** Multiplier applied to Marketing Strength before the demand score. */
  marketingStrengthMultiplier: number;
}

/** Mutable capability state of one company at the start of a quarter. */
export interface CompanyState {
  companyId: string;
  companyKey: CompanyKey;
  companyName: string;
  controllerType: ControllerType;
  /** Only set for AI-controlled companies; drives their rule-based strategy. */
  competitorProfile: CompetitorProfileKey | null;
  brandAwareness: number;
  productQuality: number;
  technology: number;
  distribution: number;
  customerExperience: number;
  customerSatisfaction: number;
  cash: number;
}

/** One company's decision for one quarter. */
export interface QuarterDecision {
  productPoints: number;
  technologyPoints: number;
  marketingPoints: number;
  distributionPoints: number;
  cxPoints: number;
  priceIndex: number;
}

/** The five investment areas, in the canonical order used everywhere in the UI. */
export const INVESTMENT_FIELDS = [
  'productPoints',
  'technologyPoints',
  'marketingPoints',
  'distributionPoints',
  'cxPoints',
] as const;

export type InvestmentField = (typeof INVESTMENT_FIELDS)[number];

/**
 * Intermediate values kept for teaching and for the internal simulation test
 * page. They explain *why* a KPI moved and are never needed to reproduce a result.
 */
export interface CompanyIntermediates {
  priceAttractiveness: number;
  productAttractiveness: number;
  marketingStrength: number;
  rawDemandScore: number;
  adjustedDemandScore: number;
  randomFactor: number;
  potentialDemandShare: number;
  potentialUnits: number;
  fulfilmentCapacityFactor: number;
  fulfilledPotentialUnits: number;
  conversionModifier: number;
  unitProductCost: number;
  returnRate: number;
  /** Potential units that distribution capacity could not serve. */
  unfulfilledUnits: number;
}

/** Full result row for one company for one quarter (mirrors company_quarter_results). */
export interface CompanyQuarterResult {
  companyId: string;
  companyKey: CompanyKey;
  companyName: string;
  controllerType: ControllerType;
  quarter: number;

  // Capability state after this quarter's investment.
  productQuality: number;
  technology: number;
  brandAwareness: number;
  marketingStrength: number;
  distribution: number;
  customerExperience: number;
  customerSatisfaction: number;

  // Market outcome.
  demandScore: number;
  unitsSold: number;
  actualPrice: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  returnCost: number;
  netProfit: number;
  cash: number;
  marketShare: number;
  netProfitMargin: number;

  /** Rank among the six companies this quarter (1 = best). */
  rank: number;

  intermediates: CompanyIntermediates;
}

export interface QuarterSimulationInput {
  quarter: number;
  companies: CompanyState[];
  decisions: Record<string, QuarterDecision>;
  scenarioVersion: string;
  engineVersion: string;
  /** Master seed of the session; per-company sub-seeds are derived from it. */
  seed: string;
}

export interface QuarterSimulationResult {
  quarter: number;
  eventKey: MarketEventKey;
  marketUnits: number;
  weights: DemandWeights;
  companyResults: CompanyQuarterResult[];
  /** Company keys ordered best-first by the configured quarterly ranking metric. */
  ranking: CompanyKey[];
  /** Company states to carry into the next quarter. */
  nextStates: CompanyState[];
  engineVersion: string;
  scenarioVersion: string;
}

/** Score breakdown for one company at the end of the game (spec 8.2). */
export interface FinalScoreBreakdown {
  cumulativeRevenue: number;
  cumulativeProfit: number;
  finalMarketShare: number;
  finalBrand: number;
  finalCsat: number;
  finalProductQuality: number;
  finalTechnology: number;
  finalCash: number;
  finalNetProfitMargin: number;
  profitScore: number;
  marketShareScore: number;
  brandScore: number;
  csatScore: number;
  innovationScore: number;
  finalScore: number;
}

export interface CompanyFinalScore extends FinalScoreBreakdown {
  companyKey: CompanyKey;
  companyName: string;
  controllerType: ControllerType;
  /** Rank among the six companies by Final Score, with spec 8.3 tie-breakers. */
  gameRank: number;
}

export type StrategyLabel =
  | 'ACQUISITION_FOCUS'
  | 'INNOVATION_FOCUS'
  | 'AGGRESSIVE_PRICING'
  | 'PREMIUM_POSITIONING'
  | 'CX_STRENGTH'
  | 'DISTRIBUTION_LED'
  | 'GROWTH_WITHOUT_PROFIT'
  | 'BALANCED_STRATEGY';

/** Key of a lesson template in the `lessons` dictionary section. */
export type LessonKey =
  | 'marketingHeavy'
  | 'innovationPaid'
  | 'innovationThin'
  | 'aggressivePricing'
  | 'premiumPricing'
  | 'distributionBottleneck'
  | 'distributionStrength'
  | 'cxStrength'
  | 'cxMiddling'
  | 'cxWeak'
  | 'growthNoProfit'
  | 'profitableGrowth'
  | 'negativeCash'
  | 'balanced'
  | 'positioningMatch'
  | 'positioningMismatch';

/** A rule-based lesson: a dictionary key plus the values to interpolate into it. */
export interface Lesson {
  key: LessonKey;
  values: Record<string, string | number>;
}

export type IntelKey =
  | 'premiumPricing'
  | 'aggressivePricing'
  | 'productInnovation'
  | 'marketingPush'
  | 'healthCxFocus'
  | 'distributionPush'
  | 'technologyPush'
  | 'steady';

/** Qualitative competitor intelligence line shown to the student (spec 7.3). */
export interface CompetitorIntel {
  companyKey: CompanyKey;
  companyName: string;
  key: IntelKey;
}

/** Averages of a player's own six decisions, used by the rule-based analysis. */
export interface AverageDecision {
  productPoints: number;
  technologyPoints: number;
  marketingPoints: number;
  distributionPoints: number;
  cxPoints: number;
  priceIndex: number;
}

export interface StrategyAnalysis {
  averages: AverageDecision;
  labels: StrategyLabel[];
  lessons: Lesson[];
  /** Whether the actual behaviour matched the positioning chosen at company creation. */
  positioningConsistent: boolean | null;
}

/** Validation failure codes for a submitted decision (keys of the `errors` dictionary). */
export type DecisionValidationError = 'pointsNotHundred' | 'pointsRange' | 'priceRange';
