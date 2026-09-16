'use client';

import { useState, useTransition } from 'react';
import { INVESTMENT_FIELDS, type HindsightQuarter } from '@/domain/simulation';
import { hindsightAction } from '@/server/game/actions';
import { useI18n } from '@/i18n/client';
import {
  Card,
  CardTitle,
  ErrorNote,
  TableScroll,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatMoneyCompact } from '@/lib/format';

/**
 * "What you should have done": each quarter's decision beside the best decision
 * for that quarter, with the profit difference.
 *
 * Runs only when the student asks — six searches take about a second, and
 * nobody should pay that on every page load. The server refuses entirely unless
 * the session is finished, which is the part that matters: while a game is in
 * progress this would be a way to read the answer to the next quarter.
 */
export function HindsightPanel({ sessionId }: { sessionId: string }) {
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<HindsightQuarter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await hindsightAction({ sessionId });
      if (result.ok) setRows(result.data.quarters);
      else setError(t.errors[result.error]);
    });
  };

  const totalGap = rows?.reduce((sum, row) => sum + row.profitGap, 0) ?? 0;

  return (
    <Card>
      <CardTitle hint={t.hindsight.hint}>{t.hindsight.title}</CardTitle>

      {rows ? (
        <>
          <TableScroll>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{t.common.quarterShort}</Th>
                  <Th>{t.hindsight.yours}</Th>
                  <Th align="right">{t.kpi.netProfit}</Th>
                  <Th>{t.hindsight.best}</Th>
                  <Th align="right">{t.kpi.netProfit}</Th>
                  <Th align="right">{t.hindsight.gap}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.quarter}>
                    <Td className="text-ink-200">
                      {t.common.quarterShort}
                      {row.quarter}
                    </Td>
                    <Td numeric className="text-ink-400">
                      {allocationText(row.played.decision)}
                    </Td>
                    <Td numeric align="right">
                      {formatMoneyCompact(row.played.netProfit, locale)}
                    </Td>
                    <Td numeric className="text-warn-500">
                      {allocationText(row.best.decision)}
                    </Td>
                    <Td numeric align="right" className="text-warn-500">
                      {formatMoneyCompact(row.best.netProfit, locale)}
                    </Td>
                    <Td numeric align="right" className={row.profitGap > 0 ? 'text-bad-400' : ''}>
                      {formatMoneyCompact(row.profitGap, locale)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <p className="tnum mt-4 text-sm text-ink-300">
            {t.hindsight.totalGap}:{' '}
            <span className="font-semibold text-bad-400">
              {formatMoneyCompact(totalGap, locale)}
            </span>
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="no-print rounded-lg border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? t.hindsight.running : t.hindsight.run}
        </button>
      )}

      {error ? (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </Card>
  );
}

/** The five investments and the price index, in the canonical UI order. */
function allocationText(decision: HindsightQuarter['played']['decision']): string {
  return `${INVESTMENT_FIELDS.map((field) => decision[field]).join('·')} @ ${decision.priceIndex}`;
}
