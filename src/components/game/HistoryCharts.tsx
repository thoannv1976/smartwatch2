'use client';

import {
  PLAYER_COMPANY_KEY,
  type CompanyKey,
  type CompanyQuarterResult,
} from '@/domain/simulation';
import { LineChart, type LineSeries } from '@/components/charts/LineChart';
import { COMPANY_ORDER, seriesColor } from '@/components/charts/series';
import { Card, CardTitle } from '@/components/ui/primitives';
import { useI18n } from '@/i18n/client';
import { formatMoneyCompact, formatPercent, formatScore } from '@/lib/format';

/**
 * Trend charts for the six quarters.
 *
 * Each chart holds ONE measure on ONE axis — never two scales — so revenue,
 * profit, share and capability each get their own plot rather than being forced
 * onto a shared y axis where the smaller series would flatten to nothing.
 */
export function HistoryCharts({
  resultsByQuarter,
  playerCompanyName,
  playerCompanyKey = PLAYER_COMPANY_KEY,
}: {
  /** All six companies' results, grouped by quarter in quarter order. */
  resultsByQuarter: { quarter: number; results: CompanyQuarterResult[] }[];
  playerCompanyName: string;
  /** Seat the viewer holds. Only ever differs from `player` in a group match. */
  playerCompanyKey?: CompanyKey;
}) {
  const { t, locale } = useI18n();

  if (resultsByQuarter.length === 0) return null;

  const labels = resultsByQuarter.map((q) => `${t.common.quarterShort}${q.quarter}`);

  const seriesFor = (
    pick: (result: CompanyQuarterResult) => number,
    companyKeys: readonly string[] = COMPANY_ORDER,
  ): LineSeries[] =>
    companyKeys.map((companyKey) => {
      const isPlayer = companyKey === playerCompanyKey;
      return {
        key: companyKey,
        label: isPlayer
          ? playerCompanyName
          : (resultsByQuarter[0]?.results.find((r) => r.companyKey === companyKey)?.companyName ??
            companyKey),
        color: seriesColor(companyKey),
        emphasis: isPlayer,
        values: resultsByQuarter.map((q) => {
          const result = q.results.find((r) => r.companyKey === companyKey);
          return result ? pick(result) : null;
        }),
      };
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>{t.history.chartRevenue}</CardTitle>
        <LineChart
          series={seriesFor((r) => r.revenue)}
          labels={labels}
          format={(value) => formatMoneyCompact(value, locale)}
          ariaLabel={t.history.chartRevenue}
        />
      </Card>

      <Card>
        <CardTitle>{t.history.chartNetProfit}</CardTitle>
        <LineChart
          series={seriesFor((r) => r.netProfit)}
          labels={labels}
          format={(value) => formatMoneyCompact(value, locale)}
          showZeroLine
          ariaLabel={t.history.chartNetProfit}
        />
      </Card>

      <Card>
        <CardTitle>{t.history.chartMarketShare}</CardTitle>
        <LineChart
          series={seriesFor((r) => r.marketShare)}
          labels={labels}
          format={(value) => formatPercent(value, locale, 0)}
          ariaLabel={t.history.chartMarketShare}
        />
      </Card>

      <Card>
        <CardTitle>{t.history.chartCapabilities}</CardTitle>
        {/* One company, several measures: the series here are the player's own
            capabilities, all already on the same 0-100 scale. */}
        <LineChart
          labels={labels}
          format={(value) => formatScore(value, locale)}
          ariaLabel={t.history.chartCapabilities}
          series={[
            {
              key: 'productQuality',
              label: t.kpi.productQuality,
              color: seriesColor('player'),
              emphasis: true,
              values: playerValues(resultsByQuarter, (r) => r.productQuality, playerCompanyKey),
            },
            {
              key: 'technology',
              label: t.kpi.technology,
              color: seriesColor('apple'),
              values: playerValues(resultsByQuarter, (r) => r.technology, playerCompanyKey),
            },
            {
              key: 'brandAwareness',
              label: t.kpi.brandAwareness,
              color: seriesColor('garmin'),
              values: playerValues(resultsByQuarter, (r) => r.brandAwareness, playerCompanyKey),
            },
            {
              key: 'distribution',
              label: t.kpi.distribution,
              color: seriesColor('samsung'),
              values: playerValues(resultsByQuarter, (r) => r.distribution, playerCompanyKey),
            },
            {
              key: 'customerExperience',
              label: t.kpi.customerExperience,
              color: seriesColor('huawei'),
              values: playerValues(resultsByQuarter, (r) => r.customerExperience, playerCompanyKey),
            },
            {
              key: 'customerSatisfaction',
              label: t.kpi.customerSatisfaction,
              color: seriesColor('pixel'),
              values: playerValues(resultsByQuarter, (r) => r.customerSatisfaction, playerCompanyKey),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function playerValues(
  resultsByQuarter: { quarter: number; results: CompanyQuarterResult[] }[],
  pick: (result: CompanyQuarterResult) => number,
  playerCompanyKey: CompanyKey = PLAYER_COMPANY_KEY,
): (number | null)[] {
  return resultsByQuarter.map((q) => {
    const result = q.results.find((r) => r.companyKey === playerCompanyKey);
    return result ? pick(result) : null;
  });
}
