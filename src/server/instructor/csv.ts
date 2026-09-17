import { goldenUsedQuarters, quarterForecast } from '@/db/models';
import type { FinalResultDoc, QuarterDoc } from '@/db/models';
import {
  PLAYER_COMPANY_KEY,
  scoreForecast,
  type CompanyKey,
  type CompanyQuarterResult,
  type QuarterForecast,
} from '@/domain/simulation';

/**
 * The four prediction columns, or four blanks.
 *
 * A quarter with no prediction exports empty cells rather than zeros: a zero in
 * a gradebook reads as a mark, and nobody predicted zero. `escapeCell` already
 * neutralises a reason beginning with `=`, `+`, `-` or `@`, which matters here
 * more than anywhere else in the file — this is the one column a student writes
 * in free text.
 */
function forecastCells(
  forecast: QuarterForecast | null,
  result: CompanyQuarterResult,
): (string | number | null)[] {
  if (!forecast) return [null, null, null, null];
  const score = scoreForecast(forecast, result);
  return [score.predictedRank, score.predictedShare, score.rankGap, score.note];
}

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
  // What the student predicted BEFORE this quarter ran. Empty for quarters
  // played before predictions existed, and for anyone who skipped the optional
  // fields. Never part of the score — the instructor decides what it is worth.
  'predicted_rank',
  'predicted_share',
  'rank_gap',
  'student_reason',
];

/**
 * Per-quarter export of one student's own company: its decisions and results.
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
    /**
     * Which of the six companies is this student's.
     *
     * Always `player` in a solo session, which is why it defaults. In a group
     * match the six companies are six students, so the row to export is the one
     * for the seat they were given.
     */
    seatKey?: CompanyKey;
  }[],
): string {
  const rows: (string | number | null)[][] = [];

  for (const entry of entries) {
    for (const quarter of [...entry.quarters].sort((a, b) => a.quarter - b.quarter)) {
      const seatKey = entry.seatKey ?? PLAYER_COMPANY_KEY;
      const decision = quarter.decisions[seatKey];
      const result = quarter.results.find((r) => r.companyKey === seatKey);
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
        ...forecastCells(quarterForecast(quarter), result),
      ]);
    }
  }

  return toCsv(QUARTER_HEADERS, rows);
}

const GROUP_HEADERS = [
  'group_name',
  'student_code',
  'display_name',
  'email',
  'company_name',
  'seat',
  'quarter',
  'event',
  'product_points',
  'technology_points',
  'marketing_points',
  'distribution_points',
  'cx_points',
  'price_index',
  // 1 when the system supplied this decision because the instructor forced the
  // quarter through before the student submitted.
  'was_default',
  'units_sold',
  'actual_price',
  'revenue',
  'net_profit',
  'net_profit_margin',
  'market_share',
  'rank',
  'product_quality',
  'technology',
  'brand_awareness',
  'distribution',
  'customer_experience',
  'customer_satisfaction',
  'predicted_rank',
  'predicted_share',
  'rank_gap',
  'student_reason',
];

/**
 * Per-quarter export of a whole group: all six companies side by side.
 *
 * The file that answers "why did this company win and that one lose", which in
 * a group match is a question about six students rather than one. Unlike
 * anything a student can see, it carries the exact allocations of all six —
 * staff may see those (spec 7.3), and comparing them IS the teaching material.
 *
 * Bot-driven seats are included, marked by an empty student code and name, so
 * the market in the file is the market that was actually simulated.
 */
export function groupsToCsv(
  groups: {
    groupName: string;
    quarters: QuarterDoc[];
    members: {
      seatKey: CompanyKey;
      studentCode: string | null;
      displayName: string;
      email: string;
      companyName: string;
    }[];
    /** `${quarter}_${seatKey}` -> whether the decision was supplied by the system. */
    defaults: Map<string, boolean>;
    /**
     * `${quarter}_${seatKey}` -> what that student predicted.
     *
     * Keyed the same way as `defaults` rather than read off the quarter,
     * because in a group match the prediction lives on each student's own
     * submission, not on the shared quarter document.
     */
    forecasts?: Map<string, QuarterForecast>;
  }[],
): string {
  const rows: (string | number | null)[][] = [];

  for (const group of groups) {
    const bySeat = new Map(group.members.map((m) => [m.seatKey, m]));

    for (const quarter of [...group.quarters].sort((a, b) => a.quarter - b.quarter)) {
      for (const result of [...quarter.results].sort((a, b) => a.rank - b.rank)) {
        const decision = quarter.decisions[result.companyKey];
        if (!decision) continue;
        const member = bySeat.get(result.companyKey);

        rows.push([
          group.groupName,
          member?.studentCode ?? '',
          member?.displayName ?? '',
          member?.email ?? '',
          result.companyName,
          result.companyKey,
          quarter.quarter,
          quarter.eventKey,
          decision.productPoints,
          decision.technologyPoints,
          decision.marketingPoints,
          decision.distributionPoints,
          decision.cxPoints,
          decision.priceIndex,
          group.defaults.get(`${quarter.quarter}_${result.companyKey}`) ? 1 : 0,
          result.unitsSold,
          result.actualPrice,
          result.revenue,
          result.netProfit,
          result.netProfitMargin,
          result.marketShare,
          result.rank,
          result.productQuality,
          result.technology,
          result.brandAwareness,
          result.distribution,
          result.customerExperience,
          result.customerSatisfaction,
          ...forecastCells(
            group.forecasts?.get(`${quarter.quarter}_${result.companyKey}`) ?? null,
            result,
          ),
        ]);
      }
    }
  }

  return toCsv(GROUP_HEADERS, rows);
}
