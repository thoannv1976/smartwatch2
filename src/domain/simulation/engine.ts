import { getGameConfig, type GameConfig } from './config';
import { getMarketEvent } from './events';
import {
  actualPrice,
  brandAwareness,
  conversionModifier,
  customerSatisfaction,
  demandScore,
  eventAdjustedProductAttractiveness,
  fulfilmentCapacityFactor,
  improveCapability,
  isValidDecision,
  marketingStrength,
  priceAttractiveness,
  returnRate,
  round,
  unitProductCost,
} from './formulas';
import { seededRandomFactor } from './random';
import type {
  CompanyKey,
  CompanyQuarterResult,
  CompanyState,
  MarketEvent,
  QuarterDecision,
  QuarterSimulationInput,
  QuarterSimulationResult,
} from './types';

/**
 * The market simulation engine (spec 5, 11.4).
 *
 * PURE by contract: no database, no external API, no React, no authentication.
 * It takes six companies and six decision sets — never "the player" plus
 * competitors — so the future 6-human multiplayer version reuses this file
 * unchanged and only swaps how the six decisions are collected (spec 16.2).
 *
 * ORDER OF CALCULATION inside one quarter (locked down; covered by tests):
 *   1. validate decisions
 *   2. update accumulating capabilities (product, tech, distribution, CX)
 *   3. actual price + price attractiveness
 *   4. CSAT from the NEW capabilities
 *   5. brand awareness from previous brand + marketing points + NEW CSAT
 *   6. marketing strength (with the Q6 event multiplier)
 *   7. product attractiveness (event multipliers applied to contributions)
 *   8. demand score with the quarter's event weights
 *   9. x seeded random factor 0.98-1.02
 *  10. allocate potential demand across the six companies
 *  11. fulfilment constraint, then conversion modifier -> units sold
 *  12. revenue, COGS, gross profit, returns, net profit, cash
 *  13. market share, net profit margin, ranking
 *
 * Steps 2-9 are per company and independent; step 10 is where companies compete.
 */

/** Per-company values computed before demand is allocated across the market. */
interface PreAllocation {
  state: CompanyState;
  decision: QuarterDecision;
  productQuality: number;
  technology: number;
  distribution: number;
  customerExperience: number;
  customerSatisfaction: number;
  brandAwareness: number;
  marketingStrength: number;
  priceAttractiveness: number;
  productAttractiveness: number;
  actualPrice: number;
  rawDemandScore: number;
  randomFactor: number;
  adjustedDemandScore: number;
}

function computePreAllocation(
  state: CompanyState,
  decision: QuarterDecision,
  event: MarketEvent,
  masterSeed: string,
  quarter: number,
  config: GameConfig,
): PreAllocation {
  // 2. Accumulating capabilities with diminishing returns.
  const productQuality = improveCapability(state.productQuality, decision.productPoints, config);
  const technology = improveCapability(state.technology, decision.technologyPoints, config);
  const distribution = improveCapability(state.distribution, decision.distributionPoints, config);
  const customerExperience = improveCapability(state.customerExperience, decision.cxPoints, config);

  // 3. Price.
  const price = actualPrice(decision.priceIndex, config);
  const priceAttr = priceAttractiveness(decision.priceIndex, config);

  // 4. CSAT from the new capabilities.
  const csat = customerSatisfaction(
    {
      productQuality,
      technology,
      distribution,
      customerExperience,
      priceAttractiveness: priceAttr,
    },
    config,
  );

  // 5. Brand awareness. Which CSAT feeds brand is a documented engine choice.
  const csatForBrand = config.brandUsesNewCsat ? csat : state.customerSatisfaction;
  const brand = brandAwareness(
    state.brandAwareness,
    decision.marketingPoints,
    csatForBrand,
    config,
  );

  // 6. Marketing strength, including the Q6 shopping-peak multiplier.
  const marketing = marketingStrength(
    decision.marketingPoints,
    event.marketingStrengthMultiplier,
    config,
  );

  // 7. Product attractiveness with event contribution multipliers.
  const productAttr = eventAdjustedProductAttractiveness(
    {
      productQuality,
      technology,
      brandAwareness: brand,
      customerExperience,
    },
    event,
    config,
  );

  // 8. Demand score with the quarter's weights.
  const rawDemand = demandScore(
    {
      productAttractiveness: productAttr,
      priceAttractiveness: priceAttr,
      brandAwareness: brand,
      marketingStrength: marketing,
      distribution,
      customerExperience,
    },
    event.weights,
  );

  // 9. Controlled randomness, derived from master seed + quarter + company key.
  const randomFactor = round(
    seededRandomFactor(masterSeed, quarter, state.companyKey, config.randomMin, config.randomMax),
    6,
  );

  return {
    state,
    decision,
    productQuality,
    technology,
    distribution,
    customerExperience,
    customerSatisfaction: csat,
    brandAwareness: brand,
    marketingStrength: marketing,
    priceAttractiveness: priceAttr,
    productAttractiveness: productAttr,
    actualPrice: price,
    rawDemandScore: rawDemand,
    randomFactor,
    adjustedDemandScore: round(rawDemand * randomFactor, 6),
  };
}

/** Metric used to order the six companies within a quarter (spec 8.1). */
function quarterlyRankValue(result: CompanyQuarterResult, config: GameConfig): number {
  switch (config.quarterlyRankBy) {
    case 'netProfit':
      return result.netProfit;
    case 'revenue':
      return result.revenue;
    case 'marketShare':
    default:
      return result.marketShare;
  }
}

/**
 * Simulates one quarter for all six companies.
 *
 * @throws if a decision is missing or invalid — the caller (server) must validate
 * and reject before reaching the engine, so an invalid state here is a bug.
 */
export function simulateQuarter(
  input: QuarterSimulationInput,
  config: GameConfig = getGameConfig(input.scenarioVersion),
): QuarterSimulationResult {
  const { quarter, companies, decisions, seed } = input;

  if (quarter < 1 || quarter > config.quarters) {
    throw new Error(`Quarter ${quarter} is outside 1..${config.quarters}`);
  }
  if (companies.length === 0) {
    throw new Error('simulateQuarter requires at least one company');
  }

  const event = getMarketEvent(quarter, config, seed);

  // --- Steps 1-9: independent per company ---
  const pre: PreAllocation[] = companies.map((state) => {
    const decision = decisions[state.companyKey];
    if (!decision) {
      throw new Error(`Missing decision for company ${state.companyKey}`);
    }
    if (!isValidDecision(decision, config)) {
      throw new Error(`Invalid decision for company ${state.companyKey}`);
    }
    return computePreAllocation(state, decision, event, seed, quarter, config);
  });

  // --- Step 10: demand allocation, the only place companies interact ---
  const totalDemandScore = pre.reduce((sum, p) => sum + p.adjustedDemandScore, 0);

  const preliminary = pre.map((p) => {
    const potentialDemandShare = totalDemandScore > 0 ? p.adjustedDemandScore / totalDemandScore : 0;
    const potentialUnits = event.marketUnits * potentialDemandShare;

    // 11. Distribution constraint, then conversion.
    const capacityFactor = fulfilmentCapacityFactor(p.distribution, config);
    const fulfilledPotentialUnits = potentialUnits * capacityFactor;
    const conversion = conversionModifier(p.technology, p.customerExperience, config);
    const unitsSold = Math.max(0, Math.round(fulfilledPotentialUnits * conversion));

    // 12. Money.
    const revenue = round(unitsSold * p.actualPrice, 2);
    const unitCost = unitProductCost(p.productQuality, p.technology, config);
    const cogs = round(unitsSold * unitCost, 2);
    const grossProfit = round(revenue - cogs, 2);
    const rate = returnRate(p.productQuality, p.customerExperience, config);
    const returnCost = round(revenue * rate * config.returnCostShare, 2);
    const netProfit = round(
      grossProfit -
        config.quarterlyStrategicInvestment -
        config.quarterlyFixedOperatingCost -
        returnCost,
      2,
    );
    const cash = round(p.state.cash + netProfit, 2);

    return {
      pre: p,
      potentialDemandShare,
      potentialUnits,
      capacityFactor,
      fulfilledPotentialUnits,
      conversion,
      unitsSold,
      revenue,
      unitCost,
      cogs,
      grossProfit,
      rate,
      returnCost,
      netProfit,
      cash,
    };
  });

  // 13. Market share is relative to total units actually sold.
  const totalUnits = preliminary.reduce((sum, r) => sum + r.unitsSold, 0);

  const companyResults: CompanyQuarterResult[] = preliminary.map((r) => {
    const p = r.pre;
    const marketShare = totalUnits > 0 ? round(r.unitsSold / totalUnits, 6) : 0;
    const netProfitMargin = r.revenue > 0 ? round(r.netProfit / r.revenue, 6) : 0;

    return {
      companyId: p.state.companyId,
      companyKey: p.state.companyKey,
      companyName: p.state.companyName,
      controllerType: p.state.controllerType,
      quarter,

      productQuality: p.productQuality,
      technology: p.technology,
      brandAwareness: p.brandAwareness,
      marketingStrength: p.marketingStrength,
      distribution: p.distribution,
      customerExperience: p.customerExperience,
      customerSatisfaction: p.customerSatisfaction,

      demandScore: p.adjustedDemandScore,
      unitsSold: r.unitsSold,
      actualPrice: p.actualPrice,
      revenue: r.revenue,
      cogs: r.cogs,
      grossProfit: r.grossProfit,
      returnCost: r.returnCost,
      netProfit: r.netProfit,
      cash: r.cash,
      marketShare,
      netProfitMargin,

      // Filled in below, once every company's result exists.
      rank: 0,

      intermediates: {
        priceAttractiveness: p.priceAttractiveness,
        productAttractiveness: p.productAttractiveness,
        marketingStrength: p.marketingStrength,
        rawDemandScore: p.rawDemandScore,
        adjustedDemandScore: p.adjustedDemandScore,
        randomFactor: p.randomFactor,
        potentialDemandShare: round(r.potentialDemandShare, 6),
        potentialUnits: round(r.potentialUnits, 2),
        fulfilmentCapacityFactor: r.capacityFactor,
        fulfilledPotentialUnits: round(r.fulfilledPotentialUnits, 2),
        conversionModifier: r.conversion,
        unitProductCost: r.unitCost,
        returnRate: r.rate,
        // Demand lost to FULFILMENT only — what distribution could not deliver.
        // Measuring against unitsSold instead would fold in the conversion
        // modifier, which is under 1.00 unless technology and customer
        // experience both reach 100; the figure would then stay positive at
        // distribution 100 and tell a student their distribution is the
        // bottleneck when it demonstrably is not. The UI labels this
        // "unfulfilled potential demand" and blames delivery capacity, so the
        // number has to mean exactly that.
        unfulfilledUnits: round(
          Math.max(0, r.potentialUnits - r.fulfilledPotentialUnits),
          2,
        ),
      },
    };
  });

  // Ranking: best-first on the configured metric, ties broken by net profit then
  // company key so the order is fully deterministic.
  const ranked = [...companyResults].sort((a, b) => {
    const diff = quarterlyRankValue(b, config) - quarterlyRankValue(a, config);
    if (diff !== 0) return diff;
    const profitDiff = b.netProfit - a.netProfit;
    if (profitDiff !== 0) return profitDiff;
    return a.companyKey.localeCompare(b.companyKey);
  });
  ranked.forEach((result, index) => {
    result.rank = index + 1;
  });

  const nextStates: CompanyState[] = companyResults.map((result) => {
    const previous = companies.find((c) => c.companyKey === result.companyKey);
    return {
      companyId: result.companyId,
      companyKey: result.companyKey,
      companyName: result.companyName,
      controllerType: result.controllerType,
      competitorProfile: previous?.competitorProfile ?? null,
      brandAwareness: result.brandAwareness,
      productQuality: result.productQuality,
      technology: result.technology,
      distribution: result.distribution,
      customerExperience: result.customerExperience,
      customerSatisfaction: result.customerSatisfaction,
      cash: result.cash,
    };
  });

  return {
    quarter,
    eventKey: event.key,
    marketUnits: event.marketUnits,
    weights: event.weights,
    companyResults,
    ranking: ranked.map((r) => r.companyKey) as CompanyKey[],
    nextStates,
    engineVersion: input.engineVersion,
    scenarioVersion: input.scenarioVersion,
  };
}

/** Builds the initial six-company roster: one player company plus five benchmarks. */
export function createInitialCompanies(
  playerCompanyName: string,
  config: GameConfig = getGameConfig(),
): CompanyState[] {
  const player: CompanyState = {
    companyId: 'player',
    companyKey: 'player',
    companyName: playerCompanyName,
    controllerType: 'PLAYER',
    competitorProfile: null,
    ...config.playerStart,
  };

  const competitors: CompanyState[] = config.competitors.map((competitor) => ({
    companyId: competitor.key,
    companyKey: competitor.key,
    companyName: competitor.displayName,
    controllerType: 'AI',
    competitorProfile: competitor.key,
    ...competitor.start,
  }));

  return [player, ...competitors];
}
