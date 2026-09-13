import { getGameConfig, type GameConfig } from './config';
import { clamp, round } from './formulas';
import type {
  CompanyFinalScore,
  CompanyKey,
  CompanyQuarterResult,
  FinalScoreBreakdown,
} from './types';

/**
 * Final scoring and rankings (spec 8.2, 8.3).
 *
 * The scoring intentionally rewards a coherent business, not a single maximised
 * variable: high unit sales alone cannot produce the highest Final Score.
 */

/** All quarter results for one company, in quarter order. */
export type CompanyHistory = CompanyQuarterResult[];

export function computeFinalScoreBreakdown(
  history: CompanyHistory,
  config: GameConfig = getGameConfig(),
): FinalScoreBreakdown {
  const sorted = [...history].sort((a, b) => a.quarter - b.quarter);
  const last = sorted[sorted.length - 1];

  const cumulativeRevenue = round(
    sorted.reduce((sum, r) => sum + r.revenue, 0),
    2,
  );
  const cumulativeProfit = round(
    sorted.reduce((sum, r) => sum + r.netProfit, 0),
    2,
  );

  const finalMarketShare = last?.marketShare ?? 0;
  const finalBrand = last?.brandAwareness ?? 0;
  const finalCsat = last?.customerSatisfaction ?? 0;
  const finalProductQuality = last?.productQuality ?? 0;
  const finalTechnology = last?.technology ?? 0;
  const finalCash = last?.cash ?? 0;
  const finalNetProfitMargin = last?.netProfitMargin ?? 0;

  // 30% Profit: clamp(50 + CumulativeNetProfit / divisor, 0, 100)
  const profitScore = round(
    clamp(config.profitScoreBase + cumulativeProfit / config.profitScoreDivisor, 0, 100),
    4,
  );

  // 25% Market share: clamp(FinalMarketSharePercent x 3, 0, 100)
  const marketShareScore = round(
    clamp(finalMarketShare * 100 * config.marketShareScoreMultiplier, 0, 100),
    4,
  );

  // 15% each: brand, CSAT, innovation (product + technology).
  const brandScore = round(clamp(finalBrand, 0, 100), 4);
  const csatScore = round(clamp(finalCsat, 0, 100), 4);
  const innovationScore = round(clamp(0.5 * finalProductQuality + 0.5 * finalTechnology, 0, 100), 4);

  const w = config.scoreWeights;
  const finalScore = round(
    w.profit * profitScore +
      w.marketShare * marketShareScore +
      w.brand * brandScore +
      w.csat * csatScore +
      w.innovation * innovationScore,
    4,
  );

  return {
    cumulativeRevenue,
    cumulativeProfit,
    finalMarketShare,
    finalBrand,
    finalCsat,
    finalProductQuality,
    finalTechnology,
    finalCash,
    finalNetProfitMargin,
    profitScore,
    marketShareScore,
    brandScore,
    csatScore,
    innovationScore,
    finalScore,
  };
}

/**
 * Compares two competitors for ranking, applying the spec 8.3 tie-breakers:
 * Final Score, then cumulative net profit, then final market share, then final
 * brand awareness, and finally company key so the order is always total.
 */
export function compareByFinalScore(
  a: FinalScoreBreakdown & { companyKey: string },
  b: FinalScoreBreakdown & { companyKey: string },
): number {
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
  if (b.cumulativeProfit !== a.cumulativeProfit) return b.cumulativeProfit - a.cumulativeProfit;
  if (b.finalMarketShare !== a.finalMarketShare) return b.finalMarketShare - a.finalMarketShare;
  if (b.finalBrand !== a.finalBrand) return b.finalBrand - a.finalBrand;
  return a.companyKey.localeCompare(b.companyKey);
}

/**
 * Scores all six companies of a session and assigns the in-game rank.
 *
 * @param historiesByCompany quarter results grouped by company key
 */
export function computeGameFinalScores(
  historiesByCompany: Map<CompanyKey, CompanyHistory>,
  config: GameConfig = getGameConfig(),
): CompanyFinalScore[] {
  const scored: CompanyFinalScore[] = [];

  for (const [companyKey, history] of historiesByCompany) {
    if (history.length === 0) continue;
    const last = [...history].sort((a, b) => a.quarter - b.quarter)[history.length - 1];
    const breakdown = computeFinalScoreBreakdown(history, config);
    scored.push({
      ...breakdown,
      companyKey,
      companyName: last?.companyName ?? companyKey,
      controllerType: last?.controllerType ?? 'AI',
      gameRank: 0,
    });
  }

  scored.sort(compareByFinalScore);
  scored.forEach((entry, index) => {
    entry.gameRank = index + 1;
  });

  return scored;
}

/** Groups a flat list of quarter results (all companies, all quarters) by company. */
export function groupResultsByCompany(
  results: CompanyQuarterResult[],
): Map<CompanyKey, CompanyHistory> {
  const map = new Map<CompanyKey, CompanyHistory>();
  for (const result of results) {
    const existing = map.get(result.companyKey);
    if (existing) existing.push(result);
    else map.set(result.companyKey, [result]);
  }
  for (const history of map.values()) {
    history.sort((a, b) => a.quarter - b.quarter);
  }
  return map;
}
