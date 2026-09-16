import { goldenUsedQuarters } from '@/db/models';
import type { FinalResultDoc, QuarterDoc } from '@/db/models';
import { PLAYER_COMPANY_KEY } from '@/domain/simulation';

/**
 * CSV export of official results (spec 9.3, 17 item 14).
 *
 * Plain RFC 4180 quoting, no dependency. Numbers are written unformatted with a
 * dot decimal separator so the file opens correctly in any locale's spreadsheet
 * rather than being mangled by a localised thousands separator.
 */

/**
 * Cells a spreadsheet would execute rather than display.
 *
 * Excel, LibreOffice and Sheets treat a leading =, +, - or @ as the start of a
 * formula, and a leading tab or carriage return can smuggle one in. Company and
 * display names come straight from students, so an unescaped export turns the
 * instructor's gradebook into an execution surface: a company called
 * `=HYPERLINK("http://…",  "Grades")` runs when the file is opened.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** A value we wrote as a number, so the leading `-` is a minus sign. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);

  // Prefixing an apostrophe tells every major spreadsheet "this is text". Real
  // numbers are exempt, or every negative profit in the export would arrive as
  // the string '-1234.5 and stop being summable.
  if (typeof value !== 'number' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  // A UTF-8 BOM so Excel shows Vietnamese names correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}

const RESULT_HEADERS = [
  'student_code',
  'display_name',
  'email',
  'company_name',
  'product_name',
  'positioning',
  'scenario_version',
  'engine_version',
  'final_score',
  'profit_score',
  'market_share_score',
  'brand_score',
  'csat_score',
  'innovation_score',
  'cumulative_revenue',
  'cumulative_profit',
  'final_market_share',
  'final_brand',
  'final_csat',
  'final_product_quality',
  'final_technology',
  'final_cash',
  'final_net_profit_margin',
  'game_rank',
  'completed_at',
  // Appended, never inserted: an instructor's spreadsheet may address these
  // columns by position, so a new column at the end shifts nothing.
  'golden_strategy_uses',
  'golden_strategy_quarters',
];

/** One row per completed official session, ranked best first. */
export function resultsToCsv(results: FinalResultDoc[]): string {
  const rows = results.map((r) => [
    r.studentCode,
    r.displayName,
    r.email,
    r.companyName,
    r.productName,
    r.positioning,
    r.scenarioVersion,
    r.engineVersion,
    r.finalScore,
    r.profitScore,
    r.marketShareScore,
    r.brandScore,
    r.csatScore,
    r.innovationScore,
    r.cumulativeRevenue,
    r.cumulativeProfit,
    r.finalMarketShare,
    r.finalBrand,
    r.finalCsat,
    r.finalProductQuality,
    r.finalTechnology,
    r.finalCash,
    r.finalNetProfitMargin,
    r.gameRank,
    new Date(r.completedAt).toISOString(),
    goldenUsedQuarters(r).length,
    // Semicolons, not commas: a comma here would need quoting and reads as a
    // second column to anyone scanning the raw file.
    goldenUsedQuarters(r).join(';'),
  ]);
  return toCsv(RESULT_HEADERS, rows);
}

const QUARTER_HEADERS = [
  'student_code',
  'display_name',
  'company_name',
  'quarter',
  'event',
  'product_points',
  'technology_points',
  'marketing_points',
  'distribution_points',
  'cx_points',
  'price_index',
  'units_sold',
  'actual_price',
  'revenue',
  'cogs',
  'gross_profit',
  'return_cost',
  'net_profit',
  'net_profit_margin',
  'cash',
  'market_share',
  'rank',
  'product_quality',
  'technology',
  'brand_awareness',
  'distribution',
  'customer_experience',
  'customer_satisfaction',
  // 1 when the Golden Strategy was used for THIS quarter, 0 otherwise.
  'golden_strategy',
];

/**
 * Per-quarter export of the PLAYER company's decisions and results.
 *
 * This is the file that answers "why did this student win or lose?" — the
 * instructor gets every decision next to the KPI it produced.
 */
export function quartersToCsv(
  entries: {
    studentCode: string | null;
    displayName: string;
    companyName: string;
    quarters: QuarterDoc[];
    /** Quarters this student had coached; absent for rows written before the coach. */
    goldenUsedQuarters?: number[];
  }[],
): string {
  const rows: (string | number | null)[][] = [];

  for (const entry of entries) {
    for (const quarter of [...entry.quarters].sort((a, b) => a.quarter - b.quarter)) {
      const decision = quarter.decisions[PLAYER_COMPANY_KEY];
      const result = quarter.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
      if (!decision || !result) continue;

      rows.push([
        entry.studentCode,
        entry.displayName,
        entry.companyName,
        quarter.quarter,
        quarter.eventKey,
        decision.productPoints,
        decision.technologyPoints,
        decision.marketingPoints,
        decision.distributionPoints,
        decision.cxPoints,
        decision.priceIndex,
        result.unitsSold,
        result.actualPrice,
        result.revenue,
        result.cogs,
        result.grossProfit,
        result.returnCost,
        result.netProfit,
        result.netProfitMargin,
        result.cash,
        result.marketShare,
        result.rank,
        result.productQuality,
        result.technology,
        result.brandAwareness,
        result.distribution,
        result.customerExperience,
        result.customerSatisfaction,
        goldenUsedQuarters(entry).includes(quarter.quarter) ? 1 : 0,
      ]);
    }
  }

  return toCsv(QUARTER_HEADERS, rows);
}
