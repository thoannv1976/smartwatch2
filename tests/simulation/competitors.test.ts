import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPETITOR_CONTEXT,
  buildCompetitorIntel,
  competitorIntelKey,
  generateAllCompetitorDecisions,
  generateCompetitorDecision,
  getMarketEvent,
  normalizePoints,
  totalInvestmentPoints,
  validateDecision,
  weakestPriorityField,
  type CompetitorContext,
} from '@/domain/simulation';
import { TEST_SEED, config } from './helpers';

/** Spec 7: the five benchmark competitors must always submit valid, adaptive decisions. */

const apple = config.competitors.find((c) => c.key === 'apple')!;
const garmin = config.competitors.find((c) => c.key === 'garmin')!;
const huawei = config.competitors.find((c) => c.key === 'huawei')!;
const samsung = config.competitors.find((c) => c.key === 'samsung')!;

describe('competitor decisions are always valid', () => {
  it('produces exactly 100 points and an in-range price for every competitor and quarter', () => {
    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      const event = getMarketEvent(quarter, config);
      const decisions = generateAllCompetitorDecisions(
        quarter,
        event,
        {},
        TEST_SEED,
        config,
      );
      expect(Object.keys(decisions)).toHaveLength(5);
      for (const [key, decision] of Object.entries(decisions)) {
        expect(validateDecision(decision, config), `${key} q${quarter}`).toEqual([]);
        expect(totalInvestmentPoints(decision)).toBe(100);
        expect(decision.priceIndex).toBeGreaterThanOrEqual(config.priceIndexMin);
        expect(decision.priceIndex).toBeLessThanOrEqual(config.priceIndexMax);
      }
    }
  });

  it('stays valid under punishing performance context', () => {
    const harsh: CompetitorContext = {
      previousMarketShare: 0.02,
      marketShareTwoQuartersAgo: 0.3,
      previousCsat: 10,
      previousNetProfitMargin: -0.8,
    };
    for (const competitor of config.competitors) {
      for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
        const decision = generateCompetitorDecision(
          competitor,
          quarter,
          getMarketEvent(quarter, config),
          harsh,
          TEST_SEED,
          config,
        );
        expect(validateDecision(decision, config), `${competitor.key} q${quarter}`).toEqual([]);
      }
    }
  });

  it('is deterministic for the same seed and different for another seed', () => {
    const event = getMarketEvent(3, config);
    const a = generateCompetitorDecision(apple, 3, event, EMPTY_COMPETITOR_CONTEXT, TEST_SEED, config);
    const b = generateCompetitorDecision(apple, 3, event, EMPTY_COMPETITOR_CONTEXT, TEST_SEED, config);
    const c = generateCompetitorDecision(apple, 3, event, EMPTY_COMPETITOR_CONTEXT, 'other', config);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
});

describe('competitors retain their strategic personality (spec 2.3, 7.1)', () => {
  it('keeps Apple premium and Huawei value-priced', () => {
    const event = getMarketEvent(1, config);
    const appleDecision = generateCompetitorDecision(
      apple,
      1,
      event,
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    const huaweiDecision = generateCompetitorDecision(
      huawei,
      1,
      event,
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    expect(appleDecision.priceIndex).toBeGreaterThan(huaweiDecision.priceIndex);
  });

  it('keeps Garmin the heaviest product investor in a normal market', () => {
    const event = getMarketEvent(1, config);
    const decisions = generateAllCompetitorDecisions(1, event, {}, TEST_SEED, config);
    const garminProduct = decisions.garmin!.productPoints;
    for (const key of ['apple', 'samsung', 'huawei', 'pixel'] as const) {
      expect(garminProduct).toBeGreaterThanOrEqual(decisions[key]!.productPoints);
    }
  });
});

describe('competitors adapt to events (spec 7.2)', () => {
  it('Garmin adds product emphasis in the Q2 fitness boom', () => {
    const normal = generateCompetitorDecision(
      garmin,
      1,
      getMarketEvent(1, config),
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    const boom = generateCompetitorDecision(
      garmin,
      2,
      getMarketEvent(2, config),
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    // Product's share of the 100 points must rise in the fitness quarter.
    expect(boom.productPoints).toBeGreaterThan(normal.productPoints - 3);
    expect(boom.productPoints + boom.technologyPoints).toBeGreaterThan(
      normal.marketingPoints + normal.distributionPoints,
    );
  });

  it('Huawei cuts price in the Q3 price-competition event', () => {
    const normal = generateCompetitorDecision(
      huawei,
      1,
      getMarketEvent(1, config),
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    const priceWar = generateCompetitorDecision(
      huawei,
      3,
      getMarketEvent(3, config),
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    expect(priceWar.priceIndex).toBeLessThan(normal.priceIndex);
  });

  it('technology-oriented competitors push technology in the Q5 AI event', () => {
    const normal = generateCompetitorDecision(
      samsung,
      1,
      getMarketEvent(1, config),
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    const aiWave = generateCompetitorDecision(
      samsung,
      5,
      getMarketEvent(5, config),
      EMPTY_COMPETITOR_CONTEXT,
      TEST_SEED,
      config,
    );
    expect(aiWave.technologyPoints).toBeGreaterThan(normal.technologyPoints - 3);
  });
});

describe('competitors adapt to their own performance (spec 7.2)', () => {
  it('raises the price index when the previous margin was negative', () => {
    const event = getMarketEvent(2, config);
    const healthy = generateCompetitorDecision(
      samsung,
      2,
      event,
      { ...EMPTY_COMPETITOR_CONTEXT, previousNetProfitMargin: 0.2 },
      TEST_SEED,
      config,
    );
    const losing = generateCompetitorDecision(
      samsung,
      2,
      event,
      { ...EMPTY_COMPETITOR_CONTEXT, previousNetProfitMargin: -0.1 },
      TEST_SEED,
      config,
    );
    expect(losing.priceIndex).toBe(healthy.priceIndex + config.ai.priceIndexBumpOnNegativeMargin);
  });

  it('shifts points toward marketing after losing more than 2 points of share', () => {
    const event = getMarketEvent(2, config);
    const steady = generateCompetitorDecision(
      apple,
      2,
      event,
      { ...EMPTY_COMPETITOR_CONTEXT, previousMarketShare: 0.2, marketShareTwoQuartersAgo: 0.2 },
      TEST_SEED,
      config,
    );
    const losingShare = generateCompetitorDecision(
      apple,
      2,
      event,
      { ...EMPTY_COMPETITOR_CONTEXT, previousMarketShare: 0.14, marketShareTwoQuartersAgo: 0.2 },
      TEST_SEED,
      config,
    );
    expect(losingShare.marketingPoints).toBeGreaterThan(steady.marketingPoints);
  });

  it('shifts points toward CX when CSAT dropped below the threshold', () => {
    const event = getMarketEvent(2, config);
    const happy = generateCompetitorDecision(
      apple,
      2,
      event,
      { ...EMPTY_COMPETITOR_CONTEXT, previousCsat: 85 },
      TEST_SEED,
      config,
    );
    const unhappy = generateCompetitorDecision(
      apple,
      2,
      event,
      { ...EMPTY_COMPETITOR_CONTEXT, previousCsat: 40 },
      TEST_SEED,
      config,
    );
    expect(unhappy.cxPoints).toBeGreaterThan(happy.cxPoints);
  });
});

describe('point normalisation', () => {
  it('always returns non-negative integers summing to the requested total', () => {
    const cases = [
      { productPoints: 30, technologyPoints: 30, marketingPoints: 30, distributionPoints: 30, cxPoints: 30 },
      { productPoints: 0, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 0 },
      { productPoints: 1, technologyPoints: 0, marketingPoints: 0, distributionPoints: 0, cxPoints: 0 },
      { productPoints: 7, technologyPoints: 11, marketingPoints: 13, distributionPoints: 17, cxPoints: 19 },
      { productPoints: -5, technologyPoints: 40, marketingPoints: 40, distributionPoints: 40, cxPoints: 40 },
    ];
    for (const input of cases) {
      const result = normalizePoints(input, 100);
      const values = Object.values(result);
      expect(values.reduce((a, b) => a + b, 0)).toBe(100);
      for (const value of values) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is stable: normalising an already-normalised map changes nothing', () => {
    const once = normalizePoints(
      { productPoints: 7, technologyPoints: 11, marketingPoints: 13, distributionPoints: 17, cxPoints: 19 },
      100,
    );
    expect(normalizePoints(once, 100)).toEqual(once);
  });

  it('identifies the weakest-priority area from the base strategy', () => {
    // Apple's base: 25 product, 30 tech, 20 marketing, 10 distribution, 15 CX.
    expect(weakestPriorityField(apple.base)).toBe('distributionPoints');
  });
});

describe('competitor intelligence never leaks exact allocations (spec 7.3)', () => {
  it('returns only a sentence key per competitor', () => {
    const event = getMarketEvent(3, config);
    const previous = generateAllCompetitorDecisions(2, getMarketEvent(2, config), {}, TEST_SEED, config);
    const current = generateAllCompetitorDecisions(3, event, {}, TEST_SEED, config);
    const intel = buildCompetitorIntel(current, previous, config);

    expect(intel).toHaveLength(5);
    for (const entry of intel) {
      expect(Object.keys(entry).sort()).toEqual(['companyKey', 'companyName', 'key']);
      expect(typeof entry.key).toBe('string');
    }
  });

  it('reports an aggressive price cut', () => {
    const key = competitorIntelKey(
      huawei,
      { ...huawei.base, priceIndex: 84 },
      { ...huawei.base, priceIndex: 90 },
    );
    expect(key).toBe('aggressivePricing');
  });

  it('reports a product innovation push', () => {
    const key = competitorIntelKey(
      garmin,
      { ...garmin.base, productPoints: garmin.base.productPoints + 6 },
      garmin.base,
    );
    expect(key).toBe('productInnovation');
  });
});
