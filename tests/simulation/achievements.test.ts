import { describe, expect, it } from 'vitest';
import {
  ALL_ACHIEVEMENTS,
  awardAchievements,
  getGameConfig,
  type AchievementQuarter,
  type CompanyFinalScore,
  type CompanyQuarterResult,
  type MarketEventKey,
  type QuarterDecision,
} from '@/domain/simulation';
import { vi as viDict } from '@/i18n/vi';
import { en as enDict } from '@/i18n/en';

/**
 * Badges.
 *
 * The property that matters most is negative: nothing here may be earnable by
 * effort alone. A badge for finishing six quarters, or for opening the app on
 * six days, teaches showing up — and this is a business course. Every condition
 * has to name something a CEO did, which is asserted below by proving that the
 * most diligent possible mediocre tenure earns nothing.
 */

const config = getGameConfig();
const even: QuarterDecision = {
  productPoints: 20,
  technologyPoints: 20,
  marketingPoints: 20,
  distributionPoints: 20,
  cxPoints: 20,
  priceIndex: 100,
};

function result(quarter: number, overrides: Partial<CompanyQuarterResult> = {}): CompanyQuarterResult {
  return {
    companyId: 'player',
    companyKey: 'player',
    companyName: 'NovaTime',
    controllerType: 'PLAYER',
    quarter,
    productQuality: 55,
    technology: 55,
    brandAwareness: 45,
    marketingStrength: 50,
    distribution: 50,
    customerExperience: 55,
    customerSatisfaction: 65,
    demandScore: 40,
    unitsSold: 60_000,
    actualPrice: 3_000_000,
    revenue: 180_000_000_000,
    cogs: 0,
    grossProfit: 0,
    returnCost: 0,
    netProfit: 5_000_000_000,
    cash: 10_000_000_000,
    marketShare: 0.17,
    netProfitMargin: 0.08,
    rank: 4,
    intermediates: {
      priceAttractiveness: 0,
      productAttractiveness: 0,
      marketingStrength: 0,
      rawDemandScore: 0,
      adjustedDemandScore: 0,
      randomFactor: 1,
      potentialDemandShare: 0,
      potentialUnits: 0,
      fulfilmentCapacityFactor: 1,
      fulfilledPotentialUnits: 0,
      conversionModifier: 1,
      unitProductCost: 0,
      returnRate: 0.05,
      unfulfilledUnits: 0,
    },
    ...overrides,
  };
}

function score(overrides: Partial<CompanyFinalScore> = {}): CompanyFinalScore {
  return {
    companyKey: 'player',
    companyName: 'NovaTime',
    controllerType: 'PLAYER',
    gameRank: 4,
    cumulativeRevenue: 0,
    cumulativeProfit: 30_000_000_000,
    finalMarketShare: 0.17,
    finalBrand: 45,
    finalCsat: 65,
    finalProductQuality: 55,
    finalTechnology: 55,
    finalCash: 10_000_000_000,
    finalNetProfitMargin: 0.08,
    profitScore: 0,
    marketShareScore: 0,
    brandScore: 0,
    csatScore: 0,
    innovationScore: 0,
    finalScore: 60,
    ...overrides,
  };
}

/** Six quarters, competently played: profitable, solvent, customers content. */
function competentTenure(): AchievementQuarter[] {
  const events: MarketEventKey[] = [
    'NORMAL_MARKET',
    'FITNESS_HEALTH_BOOM',
    'PRICE_COMPETITION',
    'ECONOMIC_SLOWDOWN',
    'AI_SMARTWATCH_FEATURES',
    'ONLINE_SHOPPING_PEAK',
  ];
  return events.map((eventKey, index) => ({
    quarter: index + 1,
    eventKey,
    weights: config.defaultDemandWeights,
    decision: even,
    result: result(index + 1),
  }));
}

/**
 * Six quarters of genuinely mediocre management: a losing quarter, customers
 * let down, and the cash run negative. Everything was submitted on time.
 */
function mediocreTenure(): AchievementQuarter[] {
  const quarters = competentTenure();
  quarters[2]!.result = result(3, { netProfit: -2_000_000_000, customerSatisfaction: 52 });
  quarters[3]!.result = result(4, { cash: -500_000_000, customerSatisfaction: 55 });
  // Decisions lurch about, so nothing resembling a steady hand either.
  quarters[4]!.decision = {
    productPoints: 70,
    technologyPoints: 10,
    marketingPoints: 10,
    distributionPoints: 5,
    cxPoints: 5,
    priceIndex: 118,
  };
  return quarters;
}

describe('nothing is earnable by effort alone', () => {
  it('AWARDS NOTHING for a complete but badly played tenure', () => {
    // The whole design in one assertion: six quarters played diligently, every
    // decision submitted on time, nothing achieved. Playing is not an
    // achievement, and neither is finishing.
    const earned = awardAchievements({
      quarters: mediocreTenure(),
      score: score({ finalCash: -500_000_000, finalCsat: 55 }),
      config,
    });
    expect(earned).toEqual([]);
  });

  it('but DOES reward the three quiet things a competent tenure got right', () => {
    // The counterweight, so the test above cannot be satisfied by making every
    // bar unreachable. Never losing money, never losing the customer and never
    // running out of cash are real outcomes, and each is a badge.
    const keys = awardAchievements({
      quarters: competentTenure(),
      score: score(),
      config,
    }).map((a) => a.key);

    expect(keys.sort()).toEqual(['capitalDiscipline', 'nobodyLeftBehind', 'sustainedProfit']);
  });

  it('does not call an identical allocation six times a steady hand', () => {
    // `competentTenure` submits the same even split every quarter and earns no
    // steadiness badge: that is not consistency, it is not playing.
    const keys = awardAchievements({
      quarters: competentTenure(),
      score: score(),
      config,
    }).map((a) => a.key);
    expect(keys).not.toContain('steadyHand');
  });

  it('does not call an even split "right move, right quarter"', () => {
    // An even allocation scores well against most weight sets simply by
    // touching everything. Rewarding it for reading the market would teach the
    // exact opposite of the lesson.
    const keys = awardAchievements({
      quarters: competentTenure(),
      score: score(),
      config,
    }).map((a) => a.key);
    expect(keys).not.toContain('eventSurfer');
  });

  it('awards nothing at all for an unfinished tenure', () => {
    // Every condition is a statement about six quarters. Judging four of them
    // against the same bar would be wrong in both directions.
    const earned = awardAchievements({
      quarters: competentTenure().slice(0, 4),
      score: score({ finalBrand: 90, finalProductQuality: 90, finalTechnology: 90 }),
      config,
    });
    expect(earned).toEqual([]);
  });
});

describe('conditions', () => {
  it('recognises a comeback from the back of the field', () => {
    const quarters = competentTenure();
    quarters[0]!.result = result(1, { rank: 6 });
    quarters[5]!.result = result(6, { rank: 2 });

    const keys = awardAchievements({ quarters, score: score(), config }).map((a) => a.key);
    expect(keys).toContain('comeback');
  });

  it('does not call a steady mid-table finish a comeback', () => {
    const quarters = competentTenure();
    quarters[0]!.result = result(1, { rank: 4 });
    quarters[5]!.result = result(6, { rank: 3 });

    const keys = awardAchievements({ quarters, score: score(), config }).map((a) => a.key);
    expect(keys).not.toContain('comeback');
  });

  it('requires EVERY quarter profitable, not most of them', () => {
    const profitable = competentTenure();
    expect(
      awardAchievements({ quarters: profitable, score: score(), config }).map((a) => a.key),
    ).toContain('sustainedProfit');

    const oneLoss = competentTenure();
    oneLoss[3]!.result = result(4, { netProfit: -1 });
    expect(
      awardAchievements({ quarters: oneLoss, score: score(), config }).map((a) => a.key),
    ).not.toContain('sustainedProfit');
  });

  it('gives the prediction badge only at the sharpest band', () => {
    const quarters = competentTenure();
    expect(
      awardAchievements({ quarters, score: score(), config, forecastIndex: 95 }).map((a) => a.key),
    ).toContain('marketReader');
    expect(
      awardAchievements({ quarters, score: score(), config, forecastIndex: 80 }).map((a) => a.key),
    ).not.toContain('marketReader');
    // No predictions at all is not a failed prediction.
    expect(
      awardAchievements({ quarters, score: score(), config, forecastIndex: null }).map((a) => a.key),
    ).not.toContain('marketReader');
  });

  it('judges event quarters only, because matching an unchanged market proves nothing', () => {
    // Every event quarter played hard into that quarter's own weights.
    const quarters = competentTenure().map((q) => ({
      ...q,
      weights: { product: 0.6, price: 0.1, brand: 0.1, marketing: 0.1, distribution: 0.05, cx: 0.05 },
      decision: {
        productPoints: 60,
        technologyPoints: 10,
        marketingPoints: 10,
        distributionPoints: 10,
        cxPoints: 10,
        priceIndex: 100,
      },
    }));

    const keys = awardAchievements({ quarters, score: score(), config }).map((a) => a.key);
    expect(keys).toContain('eventSurfer');
  });

  it('sorts gold before silver before bronze', () => {
    const quarters = competentTenure();
    quarters[0]!.result = result(1, { rank: 6 });
    quarters[5]!.result = result(6, { rank: 2 });

    const earned = awardAchievements({
      quarters,
      score: score({ finalNetProfitMargin: 0.2 }),
      config,
      forecastIndex: 100,
    });

    const tiers = earned.map((a) => a.tier);
    const rank = { gold: 0, silver: 1, bronze: 2 } as const;
    expect(tiers.map((tier) => rank[tier])).toEqual(
      [...tiers.map((tier) => rank[tier])].sort((a, b) => a - b),
    );
  });
});

describe('the dictionary contract', () => {
  it('names and describes every badge in both languages', () => {
    for (const key of ALL_ACHIEVEMENTS) {
      expect(viDict.achievementName[key], `vi name ${key}`).toBeTruthy();
      expect(enDict.achievementName[key], `en name ${key}`).toBeTruthy();
      expect(viDict.achievementDesc[key], `vi desc ${key}`).toBeTruthy();
      expect(enDict.achievementDesc[key], `en desc ${key}`).toBeTruthy();
    }
  });

  it('declares every key the rules can actually award', () => {
    // A badge the code can hand out but the shelf does not list would simply
    // vanish from the "not earned" column, which is where it is most useful.
    const quarters = competentTenure();
    quarters[0]!.result = result(1, { rank: 6, customerSatisfaction: 80 });
    quarters[5]!.result = result(6, { rank: 1, customerSatisfaction: 80, marketShare: 0.4 });

    const earned = awardAchievements({
      quarters: quarters.map((q) => ({
        ...q,
        result: { ...q.result, customerSatisfaction: 80 },
      })),
      score: score({
        finalBrand: 90,
        finalProductQuality: 90,
        finalTechnology: 90,
        finalNetProfitMargin: 0.3,
        finalMarketShare: 0.4,
      }),
      config,
      forecastIndex: 100,
    });

    for (const achievement of earned) {
      expect(ALL_ACHIEVEMENTS).toContain(achievement.key);
    }
    expect(earned.length).toBeGreaterThan(3);
  });
});
