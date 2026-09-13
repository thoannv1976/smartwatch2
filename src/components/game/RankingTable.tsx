import { PLAYER_COMPANY_KEY, type CompanyQuarterResult } from '@/domain/simulation';
import { seriesColor } from '@/components/charts/series';
import { TableScroll, Td, Th } from '@/components/ui/primitives';
import { formatInteger, formatMoneyCompact, formatPercent, formatScore } from '@/lib/format';
import { getDictionary, type Locale } from '@/i18n';

/**
 * The six-company ranking shown after every quarter (spec 8.1).
 *
 * The player's row is marked three ways — a highlighted background, a bold
 * name and a "you" badge — so it is identifiable without relying on colour.
 */
export function RankingTable({
  results,
  locale,
  playerCompanyName,
}: {
  results: CompanyQuarterResult[];
  locale: Locale;
  playerCompanyName: string;
}) {
  const t = getDictionary(locale);
  const sorted = [...results].sort((a, b) => a.rank - b.rank);

  return (
    <TableScroll>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th align="center">{t.kpi.rank}</Th>
            <Th>{t.common.company}</Th>
            <Th align="right">{t.kpi.marketShare}</Th>
            <Th align="right">{t.kpi.unitsSold}</Th>
            <Th align="right">{t.kpi.revenue}</Th>
            <Th align="right">{t.kpi.netProfit}</Th>
            <Th align="right">{t.kpi.customerSatisfaction}</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((result) => {
            const isPlayer = result.companyKey === PLAYER_COMPANY_KEY;
            return (
              <tr key={result.companyKey} className={isPlayer ? 'bg-brand-500/10' : ''}>
                <Td numeric align="center" className={isPlayer ? 'font-bold' : ''}>
                  {result.rank}
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: seriesColor(result.companyKey) }}
                    />
                    <span className={isPlayer ? 'font-bold text-ink-100' : 'text-ink-200'}>
                      {isPlayer ? playerCompanyName : result.companyName}
                    </span>
                    {isPlayer ? (
                      <span className="rounded-full border border-brand-600/60 bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">
                        {t.common.you}
                      </span>
                    ) : null}
                  </span>
                </Td>
                <Td numeric align="right">
                  {formatPercent(result.marketShare, locale)}
                </Td>
                <Td numeric align="right">
                  {formatInteger(result.unitsSold, locale)}
                </Td>
                <Td numeric align="right">
                  {formatMoneyCompact(result.revenue, locale)}
                </Td>
                <Td
                  numeric
                  align="right"
                  className={result.netProfit < 0 ? 'text-bad-400' : undefined}
                >
                  {formatMoneyCompact(result.netProfit, locale)}
                </Td>
                <Td numeric align="right">
                  {formatScore(result.customerSatisfaction, locale)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}
