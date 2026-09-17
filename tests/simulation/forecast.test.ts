import { describe, expect, it } from 'vitest';
import {
  FORECAST_NOTE_MAX,
  forecastAccuracy,
  forecastBand,
  isValidForecast,
  scoreForecast,
  type CompanyQuarterResult,
  type QuarterForecast,
} from '@/domain/simulation';

/**
 * Calibration scoring.
 *
 * The one property that matters: a student who never predicted anything must
 * not be reported as having predicted badly. Predictions were added partway
 * through this app's life, so most stored sessions have none — and a report
 * that showed them a zero would be accusing them of a failure that is the
 * system's, not theirs.
 */

function result(overrides: Partial<CompanyQuarterResult> = {}): CompanyQuarterResult {
  return {
    companyId: 'player',
    companyKey: 'player',
    companyName: 'Acme',
    controllerType: 'PLAYER',
    quarter: 1,
    productQuality: 50,
    technology: 50,
    brandAwareness: 30,
    marketingStrength: 40,
    distribution: 40,
    customerExperience: 50,
    customerSatisfaction: 65,
    demandScore: 40,
    unitsSold: 60_000,
    actualPrice: 3_000_000,
    revenue: 180_000_000_000,
    cogs: 1,
    grossProfit: 1,
    returnCost: 1,
    netProfit: 1,
    cash: 1,
    marketShare: 0.2,
    netProfitMargin: 0.1,
    rank: 3,
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
      returnRate: 0,
      unfulfilledUnits: 0,
    },
    ...overrides,
  };
}

describe('scoreForecast', () => {
  it('calls an exact prediction exact', () => {
    const score = scoreForecast({ predictedRank: 3 }, result({ rank: 3 }));
    expect(score.rankGap).toBe(0);
    expect(score.direction).toBe('exact');
  });

  it('signs the error the way a student reads it, not the way the numbers run', () => {
    // Said 6th, came 1st. The rank NUMBER went down, but the student
    // underestimated themselves — and that is what the screen must say.
    const modest = scoreForecast({ predictedRank: 6 }, result({ rank: 1 }));
    expect(modest.direction).toBe('underestimated');
    expect(modest.rankGap).toBe(5);

    const cocky = scoreForecast({ predictedRank: 1 }, result({ rank: 6 }));
    expect(cocky.direction).toBe('overestimated');
    expect(cocky.rankGap).toBe(5);
  });

  it('measures the share gap in percentage points, and tolerates no prediction', () => {
    const withShare = scoreForecast(
      { predictedRank: 3, predictedShare: 0.25 },
      result({ marketShare: 0.2 }),
    );
    expect(withShare.shareGapPoints).toBe(5);

    const without = scoreForecast({ predictedRank: 3 }, result({ marketShare: 0.2 }));
    expect(without.shareGapPoints).toBeNull();
    expect(without.predictedShare).toBeNull();
  });

  it('trims a note and treats a blank one as absent', () => {
    expect(scoreForecast({ predictedRank: 1, note: '  spaced  ' }, result()).note).toBe('spaced');
    expect(scoreForecast({ predictedRank: 1, note: '   ' }, result()).note).toBeNull();
    expect(scoreForecast({ predictedRank: 1 }, result()).note).toBeNull();
  });
});

describe('forecastAccuracy', () => {
  it('returns null when nothing was predicted, rather than a zero that reads as a bad mark', () => {
    const entries = [1, 2, 3].map((quarter) => ({
      forecast: null,
      result: result({ quarter }),
    }));
    expect(forecastAccuracy(entries)).toBeNull();
  });

  it('skips unpredicted quarters instead of counting them wrong', () => {
    // Two perfect calls, four quarters with no prediction at all. A student who
    // predicted twice and was right twice has perfect calibration ON WHAT THEY
    // PREDICTED, and the denominator says so.
    const entries = [
      { forecast: { predictedRank: 2 } as QuarterForecast, result: result({ quarter: 1, rank: 2 }) },
      { forecast: null, result: result({ quarter: 2, rank: 5 }) },
      { forecast: null, result: result({ quarter: 3, rank: 5 }) },
      { forecast: { predictedRank: 4 } as QuarterForecast, result: result({ quarter: 4, rank: 4 }) },
      { forecast: null, result: result({ quarter: 5, rank: 5 }) },
      { forecast: null, result: result({ quarter: 6, rank: 5 }) },
    ];

    const accuracy = forecastAccuracy(entries);
    expect(accuracy).not.toBeNull();
    expect(accuracy!.predicted).toBe(2);
    expect(accuracy!.exact).toBe(2);
    expect(accuracy!.averageRankGap).toBe(0);
    expect(accuracy!.index).toBe(100);
    expect(accuracy!.band).toBe('sharp');
  });

  it('scores a consistently maximal miss at zero, not below it', () => {
    const entries = [1, 2, 3].map((quarter) => ({
      forecast: { predictedRank: 1 } as QuarterForecast,
      result: result({ quarter, rank: 6 }),
    }));

    const accuracy = forecastAccuracy(entries)!;
    expect(accuracy.averageRankGap).toBe(5);
    expect(accuracy.index).toBe(0);
    expect(accuracy.band).toBe('unread');
  });

  it('averages the share gap only over quarters that predicted one', () => {
    const entries = [
      {
        forecast: { predictedRank: 1, predictedShare: 0.3 } as QuarterForecast,
        result: result({ quarter: 1, rank: 1, marketShare: 0.2 }),
      },
      {
        forecast: { predictedRank: 1 } as QuarterForecast,
        result: result({ quarter: 2, rank: 1, marketShare: 0.2 }),
      },
    ];

    const accuracy = forecastAccuracy(entries)!;
    // 10 points out on the one quarter that guessed, not 5 across both.
    expect(accuracy.averageShareGapPoints).toBe(10);
    expect(accuracy.predicted).toBe(2);
  });

  it('returns the quarters in order, whatever order they arrived in', () => {
    const entries = [6, 2, 4].map((quarter) => ({
      forecast: { predictedRank: 3 } as QuarterForecast,
      result: result({ quarter, rank: 3 }),
    }));
    expect(forecastAccuracy(entries)!.quarters.map((q) => q.quarter)).toEqual([2, 4, 6]);
  });
});

describe('bands', () => {
  it('maps the index onto four bands, worst included', () => {
    expect(forecastBand(100)).toBe('sharp');
    expect(forecastBand(90)).toBe('sharp');
    expect(forecastBand(89.9)).toBe('close');
    expect(forecastBand(70)).toBe('close');
    expect(forecastBand(69.9)).toBe('loose');
    expect(forecastBand(45)).toBe('loose');
    expect(forecastBand(44.9)).toBe('unread');
    expect(forecastBand(0)).toBe('unread');
  });
});

describe('isValidForecast', () => {
  it('accepts a rank inside the field and rejects one outside it', () => {
    expect(isValidForecast({ predictedRank: 1 }, 6)).toBe(true);
    expect(isValidForecast({ predictedRank: 6 }, 6)).toBe(true);
    expect(isValidForecast({ predictedRank: 0 }, 6)).toBe(false);
    expect(isValidForecast({ predictedRank: 7 }, 6)).toBe(false);
    expect(isValidForecast({ predictedRank: 2.5 }, 6)).toBe(false);
  });

  it('rejects a share that is not a fraction', () => {
    expect(isValidForecast({ predictedRank: 1, predictedShare: 0 }, 6)).toBe(true);
    expect(isValidForecast({ predictedRank: 1, predictedShare: 1 }, 6)).toBe(true);
    expect(isValidForecast({ predictedRank: 1, predictedShare: 1.5 }, 6)).toBe(false);
    expect(isValidForecast({ predictedRank: 1, predictedShare: -0.1 }, 6)).toBe(false);
    expect(isValidForecast({ predictedRank: 1, predictedShare: Number.NaN }, 6)).toBe(false);
  });

  it('rejects a note longer than the stored limit', () => {
    expect(isValidForecast({ predictedRank: 1, note: 'x'.repeat(FORECAST_NOTE_MAX) }, 6)).toBe(true);
    expect(isValidForecast({ predictedRank: 1, note: 'x'.repeat(FORECAST_NOTE_MAX + 1) }, 6)).toBe(
      false,
    );
  });

  it('treats null optionals as absent rather than invalid', () => {
    expect(isValidForecast({ predictedRank: 3, predictedShare: null, note: null }, 6)).toBe(true);
  });
});
