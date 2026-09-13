import { describe, expect, it } from 'vitest';
import {
  PLAYER_COMPANY_KEY,
  conversionModifier,
  customerSatisfaction,
  fulfilmentCapacityFactor,
  getAllMarketEvents,
  marketingStrength,
  priceAttractiveness,
  productAttractiveness,
  simulateQuarter,
  sumWeights,
  validateDecision,
  type CompanyQuarterResult,
} from '@/domain/simulation';
import {
  baselineDecision,
  collectNumbers,
  config,
  decision,
  symmetricInput,
} from './helpers';

/**
 * The thirteen tests the specification makes a release requirement (spec 14).
 * Each `describe` block below is named after one row of that table.
 */

function playerResult(results: CompanyQuarterResult[]): CompanyQuarterResult {
  const result = results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
  if (!result) throw new Error('player result missing');
  return result;
}

describe('1. Strategy point validation — five investments total exactly 100', () => {
  it('accepts a decision totalling exactly 100', () => {
    expect(validateDecision(baselineDecision, config)).toEqual([]);
  });

  it('rejects 99 and 101 points', () => {
    expect(validateDecision(decision({ cxPoints: 19 }), config)).toContain('pointsNotHundred');
    expect(validateDecision(decision({ cxPoints: 21 }), config)).toContain('pointsNotHundred');
  });

  it('rejects negative, non-integer and out-of-range investment values', () => {
    expect(validateDecision(decision({ productPoints: -20, cxPoints: 60 }), config)).toContain(
      'pointsRange',
    );
    expect(validateDecision(decision({ productPoints: 20.5, cxPoints: 19.5 }), config)).toContain(
      'pointsRange',
    );
    expect(
      validateDecision(
        { ...baselineDecision, productPoints: 120, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: -20 },
        config,
      ),
    ).toContain('pointsRange');
  });
});

describe('2. Price validation — 80 <= PriceIndex <= 120', () => {
  it('accepts the boundaries', () => {
    expect(validateDecision(decision({ priceIndex: 80 }), config)).toEqual([]);
    expect(validateDecision(decision({ priceIndex: 120 }), config)).toEqual([]);
  });

  it('rejects values outside the range and non-integers', () => {
    expect(validateDecision(decision({ priceIndex: 79 }), config)).toContain('priceRange');
    expect(validateDecision(decision({ priceIndex: 121 }), config)).toContain('priceRange');
    expect(validateDecision(decision({ priceIndex: 100.5 }), config)).toContain('priceRange');
  });
});

describe('3. Product test — higher Product Quality increases Product Attractiveness', () => {
  it('is strictly increasing in product quality, all else equal', () => {
    const low = productAttractiveness(
      { productQuality: 40, technology: 50, brandAwareness: 30, customerExperience: 50 },
      1,
      1,
      config,
    );
    const high = productAttractiveness(
      { productQuality: 80, technology: 50, brandAwareness: 30, customerExperience: 50 },
      1,
      1,
      config,
    );
    expect(high).toBeGreaterThan(low);
  });

  it('raises units sold in a full quarter when only product quality differs', () => {
    const weak = simulateQuarter(symmetricInput({ productQuality: 40 }), config);
    const strong = simulateQuarter(symmetricInput({ productQuality: 80 }), config);
    expect(playerResult(strong.companyResults).unitsSold).toBeGreaterThan(
      playerResult(weak.companyResults).unitsSold,
    );
  });
});

describe('4. Technology test — higher Technology increases Product Attractiveness', () => {
  it('is strictly increasing in technology, all else equal', () => {
    const low = productAttractiveness(
      { productQuality: 50, technology: 40, brandAwareness: 30, customerExperience: 50 },
      1,
      1,
      config,
    );
    const high = productAttractiveness(
      { productQuality: 50, technology: 80, brandAwareness: 30, customerExperience: 50 },
      1,
      1,
      config,
    );
    expect(high).toBeGreaterThan(low);
  });

  it('also increases the conversion modifier', () => {
    expect(conversionModifier(80, 50, config)).toBeGreaterThan(conversionModifier(40, 50, config));
  });
});

describe('5. Marketing test — higher Marketing increases Marketing Strength and demand', () => {
  it('increases marketing strength up to the cap', () => {
    expect(marketingStrength(40, 1, config)).toBeGreaterThan(marketingStrength(20, 1, config));
    expect(marketingStrength(60, 1, config)).toBe(100);
  });

  it('increases units sold when only marketing points differ', () => {
    const low = simulateQuarter(
      symmetricInput({}, { marketingPoints: 5, cxPoints: 35 }),
      config,
    );
    const high = simulateQuarter(
      symmetricInput({}, { marketingPoints: 35, cxPoints: 5 }),
      config,
    );
    expect(playerResult(high.companyResults).unitsSold).toBeGreaterThan(
      playerResult(low.companyResults).unitsSold,
    );
  });
});

describe('6. Price test — lower price is more attractive, higher price earns more per unit', () => {
  it('price attractiveness decreases as the price index rises', () => {
    const values = [80, 90, 100, 110, 120].map((index) => priceAttractiveness(index, config));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
    // Spec 5.4 worked examples.
    expect(priceAttractiveness(80, config)).toBe(100);
    expect(priceAttractiveness(90, config)).toBe(92.5);
    expect(priceAttractiveness(100, config)).toBe(77.5);
    expect(priceAttractiveness(110, config)).toBe(62.5);
    expect(priceAttractiveness(120, config)).toBe(47.5);
  });

  it('a lower price sells more units, a higher price earns more revenue per unit', () => {
    const cheap = playerResult(
      simulateQuarter(symmetricInput({}, { priceIndex: 85 }), config).companyResults,
    );
    const expensive = playerResult(
      simulateQuarter(symmetricInput({}, { priceIndex: 115 }), config).companyResults,
    );

    expect(cheap.unitsSold).toBeGreaterThan(expensive.unitsSold);
    expect(expensive.actualPrice).toBeGreaterThan(cheap.actualPrice);
    expect(expensive.revenue / expensive.unitsSold).toBeGreaterThan(
      cheap.revenue / cheap.unitsSold,
    );
  });
});

describe('7. Distribution test — higher Distribution increases fulfilled potential demand', () => {
  it('increases the fulfilment capacity factor up to 1.0', () => {
    expect(fulfilmentCapacityFactor(90, config)).toBeGreaterThan(
      fulfilmentCapacityFactor(40, config),
    );
    expect(fulfilmentCapacityFactor(100, config)).toBe(1);
    expect(fulfilmentCapacityFactor(0, config)).toBe(0.7);
  });

  it('converts more of the same potential demand into fulfilled demand', () => {
    const weak = playerResult(
      simulateQuarter(symmetricInput({ distribution: 20 }), config).companyResults,
    );
    const strong = playerResult(
      simulateQuarter(symmetricInput({ distribution: 95 }), config).companyResults,
    );

    expect(strong.intermediates.fulfilmentCapacityFactor).toBeGreaterThan(
      weak.intermediates.fulfilmentCapacityFactor,
    );
    expect(strong.intermediates.unfulfilledUnits).toBeLessThan(
      weak.intermediates.unfulfilledUnits,
    );
    expect(strong.unitsSold).toBeGreaterThan(weak.unitsSold);
  });
});

describe('8. CX test — higher CX increases CSAT and the conversion modifier', () => {
  it('increases CSAT', () => {
    const low = customerSatisfaction(
      {
        productQuality: 50,
        technology: 50,
        distribution: 40,
        customerExperience: 30,
        priceAttractiveness: 77.5,
      },
      config,
    );
    const high = customerSatisfaction(
      {
        productQuality: 50,
        technology: 50,
        distribution: 40,
        customerExperience: 90,
        priceAttractiveness: 77.5,
      },
      config,
    );
    expect(high).toBeGreaterThan(low);
  });

  it('increases the conversion modifier', () => {
    expect(conversionModifier(50, 90, config)).toBeGreaterThan(conversionModifier(50, 30, config));
  });

  it('raises CSAT in a full quarter when only CX points differ', () => {
    const low = playerResult(
      simulateQuarter(symmetricInput({}, { cxPoints: 0, productPoints: 40 }), config)
        .companyResults,
    );
    const high = playerResult(
      simulateQuarter(symmetricInput({}, { cxPoints: 40, productPoints: 0 }), config)
        .companyResults,
    );
    expect(high.customerSatisfaction).toBeGreaterThan(low.customerSatisfaction);
    expect(high.intermediates.conversionModifier).toBeGreaterThan(
      low.intermediates.conversionModifier,
    );
  });
});

describe('9. Demand allocation — all valid companies receive non-negative potential demand', () => {
  it('gives every company a non-negative share and units', () => {
    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      const result = simulateQuarter(symmetricInput({}, {}, quarter), config);
      expect(result.companyResults).toHaveLength(6);
      for (const company of result.companyResults) {
        expect(company.intermediates.potentialDemandShare).toBeGreaterThanOrEqual(0);
        expect(company.intermediates.potentialUnits).toBeGreaterThanOrEqual(0);
        expect(company.unitsSold).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('allocates potential demand shares that sum to 1', () => {
    const result = simulateQuarter(symmetricInput(), config);
    const total = result.companyResults.reduce(
      (sum, r) => sum + r.intermediates.potentialDemandShare,
      0,
    );
    expect(total).toBeCloseTo(1, 5);
  });
});

describe('10. Market share — six market shares sum to 100%', () => {
  it('sums to 1 within rounding tolerance in every quarter', () => {
    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      const result = simulateQuarter(symmetricInput({}, {}, quarter), config);
      const total = result.companyResults.reduce((sum, r) => sum + r.marketShare, 0);
      expect(total).toBeCloseTo(1, 4);
    }
  });

  it('assigns a unique rank 1..6', () => {
    const result = simulateQuarter(symmetricInput(), config);
    const ranks = result.companyResults.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.ranking).toHaveLength(6);
    expect(new Set(result.ranking).size).toBe(6);
  });
});

describe('11. Seed test — same state + decisions + event + seed returns identical result', () => {
  it('produces byte-identical output across repeated runs', () => {
    const input = symmetricInput();
    const first = simulateQuarter(input, config);
    const second = simulateQuarter(input, config);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('produces a different result for a different seed', () => {
    const input = symmetricInput();
    const a = simulateQuarter(input, config);
    const b = simulateQuarter({ ...input, seed: 'a-completely-different-seed' }, config);
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('derives the random factor per company, inside the configured band', () => {
    const result = simulateQuarter(symmetricInput(), config);
    const factors = result.companyResults.map((r) => r.intermediates.randomFactor);
    for (const factor of factors) {
      expect(factor).toBeGreaterThanOrEqual(config.randomMin);
      expect(factor).toBeLessThanOrEqual(config.randomMax);
    }
    // Six companies must not all share one factor.
    expect(new Set(factors).size).toBeGreaterThan(1);
  });
});

describe('12. Boundary test — no NaN, Infinity, negative units or invalid scores', () => {
  const extremes = [
    decision({ productPoints: 100, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 0, priceIndex: 80 }),
    decision({ productPoints: 0, technologyPoints: 0, marketingPoints: 100, distributionPoints: 0, cxPoints: 0, priceIndex: 120 }),
    decision({ productPoints: 0, technologyPoints: 0, marketingPoints: 0, distributionPoints: 100, cxPoints: 0, priceIndex: 80 }),
    decision({ productPoints: 0, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 100, priceIndex: 120 }),
  ];

  it('never produces a non-finite number in any quarter or at any extreme', () => {
    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      for (const extreme of extremes) {
        const result = simulateQuarter(symmetricInput({}, extreme, quarter), config);
        for (const value of collectNumbers(result)) {
          expect(Number.isFinite(value)).toBe(true);
        }
        for (const company of result.companyResults) {
          expect(company.unitsSold).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(company.unitsSold)).toBe(true);
          expect(company.revenue).toBeGreaterThanOrEqual(0);
          expect(company.marketShare).toBeGreaterThanOrEqual(0);
          expect(company.marketShare).toBeLessThanOrEqual(1);
          for (const score of [
            company.productQuality,
            company.technology,
            company.brandAwareness,
            company.distribution,
            company.customerExperience,
            company.customerSatisfaction,
          ]) {
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('handles companies already at maximum capability', () => {
    const maxed = symmetricInput({
      productQuality: 100,
      technology: 100,
      distribution: 100,
      customerExperience: 100,
      brandAwareness: 100,
    });
    const result = simulateQuarter(maxed, config);
    const player = playerResult(result.companyResults);
    expect(player.productQuality).toBe(100);
    expect(player.technology).toBe(100);
    expect(Number.isFinite(player.netProfit)).toBe(true);
  });
});

describe('Market events are configuration-only and internally consistent (spec 6)', () => {
  it('defines one event per quarter with weights that sum to 1', () => {
    const events = getAllMarketEvents(config);
    expect(events).toHaveLength(config.quarters);
    for (const event of events) {
      expect(sumWeights(event.weights)).toBe(1);
      expect(event.marketUnits).toBeGreaterThan(0);
    }
  });

  it('matches the exact V1 effects in the spec table', () => {
    const [q1, q2, q3, q4, q5, q6] = getAllMarketEvents(config);

    expect(q1?.key).toBe('NORMAL_MARKET');
    expect(q1?.marketUnits).toBe(500_000);

    expect(q2?.key).toBe('FITNESS_HEALTH_BOOM');
    expect(q2?.productContributionMultiplier).toBe(1.2);
    expect(q2?.technologyContributionMultiplier).toBe(1.2);

    expect(q3?.key).toBe('PRICE_COMPETITION');
    expect(q3?.weights).toEqual({
      product: 0.25,
      price: 0.3,
      brand: 0.15,
      marketing: 0.15,
      distribution: 0.1,
      cx: 0.05,
    });

    expect(q4?.key).toBe('ECONOMIC_SLOWDOWN');
    expect(q4?.marketUnits).toBe(425_000);
    expect(q4?.weights).toEqual(q3?.weights);

    expect(q5?.key).toBe('AI_SMARTWATCH_FEATURES');
    expect(q5?.technologyContributionMultiplier).toBe(1.4);
    expect(q5?.marketUnits).toBe(500_000);

    expect(q6?.key).toBe('ONLINE_SHOPPING_PEAK');
    expect(q6?.marketUnits).toBe(600_000);
    expect(q6?.marketingStrengthMultiplier).toBe(1.15);
    expect(q6?.weights).toEqual({
      product: 0.25,
      price: 0.2,
      brand: 0.2,
      marketing: 0.15,
      distribution: 0.15,
      cx: 0.05,
    });
  });

  it('makes the Q2 and Q5 multipliers actually raise product attractiveness', () => {
    const stats = {
      productQuality: 60,
      technology: 60,
      brandAwareness: 40,
      customerExperience: 50,
    };
    const normal = productAttractiveness(stats, 1, 1, config);
    const fitnessBoom = productAttractiveness(stats, 1.2, 1.2, config);
    const aiWave = productAttractiveness(stats, 1, 1.4, config);
    expect(fitnessBoom).toBeGreaterThan(normal);
    expect(aiWave).toBeGreaterThan(normal);
  });
});
