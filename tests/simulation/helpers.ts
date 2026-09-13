import {
  createInitialCompanies,
  getGameConfig,
  PLAYER_COMPANY_KEY,
  type CompanyState,
  type GameConfig,
  type QuarterDecision,
  type QuarterSimulationInput,
} from '@/domain/simulation';

export const TEST_SEED = 'smartwatch-v1-test-seed';

export const config: GameConfig = getGameConfig();

/** A valid, deliberately even decision used as the baseline in "all else equal" tests. */
export const baselineDecision: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

export function decision(overrides: Partial<QuarterDecision> = {}): QuarterDecision {
  return { ...baselineDecision, ...overrides };
}

/** Gives every company the same decision, so only the tested variable differs. */
export function uniformDecisions(
  companies: CompanyState[],
  value: QuarterDecision,
): Record<string, QuarterDecision> {
  const decisions: Record<string, QuarterDecision> = {};
  for (const company of companies) decisions[company.companyKey] = value;
  return decisions;
}

/**
 * Builds a simulation input where all six companies are identical except for the
 * overrides applied to the player. This isolates a single variable, which is what
 * the spec 14 monotonicity tests require ("all else equal").
 */
export function symmetricInput(
  playerStateOverrides: Partial<CompanyState> = {},
  playerDecisionOverrides: Partial<QuarterDecision> = {},
  quarter = 1,
): QuarterSimulationInput {
  const base = createInitialCompanies('Test brand', config);
  const player = base[0];
  if (!player) throw new Error('player company missing');

  // Clone the player's starting stats onto every company so the only difference
  // is the variable under test.
  const companies: CompanyState[] = base.map((company) => ({
    ...company,
    brandAwareness: player.brandAwareness,
    productQuality: player.productQuality,
    technology: player.technology,
    distribution: player.distribution,
    customerExperience: player.customerExperience,
    customerSatisfaction: player.customerSatisfaction,
    cash: player.cash,
    ...(company.companyKey === PLAYER_COMPANY_KEY ? playerStateOverrides : {}),
  }));

  const decisions = uniformDecisions(companies, baselineDecision);
  decisions[PLAYER_COMPANY_KEY] = decision(playerDecisionOverrides);

  return {
    quarter,
    companies,
    decisions,
    scenarioVersion: config.scenarioVersion,
    engineVersion: config.engineVersion,
    seed: TEST_SEED,
  };
}

/** Recursively collects every numeric leaf of an object, for boundary assertions. */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
  return out;
}
