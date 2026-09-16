'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CompanyKey } from '@/domain/simulation';
import { refreshGroupAction } from '@/server/group/actions';
import { useI18n } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { Badge, Card, CardTitle, ErrorNote, InfoNote, WarningNote } from '@/components/ui/primitives';

/**
 * The waiting room: who is in the group, who has decided, and who everyone is
 * waiting on.
 *
 * NAMING THE BLOCKERS IS THE POINT. There is no automatic per-quarter deadline
 * — a match runs when all six have submitted, or when the instructor forces it
 * — so the one thing that can stall a group is a person. Five students who can
 * see exactly whose decision is missing will go and find them, which is a far
 * better outcome than a countdown quietly submitting on that person's behalf.
 */

export interface LobbySeat {
  seatKey: CompanyKey;
  companyName: string;
  studentName: string | null;
  isYou: boolean;
  isBot: boolean;
  hasSubmitted: boolean;
}

export function GroupLobby({
  groupId,
  groupName,
  joinCode,
  seats,
  currentQuarter,
  completed,
  youHaveSubmitted,
  lastPlayedQuarter,
}: {
  groupId: string;
  groupName: string;
  joinCode: string;
  seats: LobbySeat[];
  currentQuarter: number | null;
  completed: boolean;
  youHaveSubmitted: boolean;
  lastPlayedQuarter: number | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const occupied = seats.filter((seat) => !seat.isBot);
  const waiting = occupied.filter((seat) => !seat.hasSubmitted);

  /**
   * Re-checks with the server.
   *
   * Needed because the LAST student to submit is the one whose request runs the
   * market — the other five are sitting on a page that knows nothing about it
   * until they ask.
   */
  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const result = await refreshGroupAction({ groupId });
      if (result.ok) router.refresh();
      else setError(t.errors[result.error]);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle
          hint={t.group.rivalsHint}
          right={
            <span className="tnum shrink-0 rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 font-mono text-sm tracking-widest text-ink-100">
              {joinCode}
            </span>
          }
        >
          {groupName} · {interpolate(t.group.membersCount, { count: occupied.length })}
        </CardTitle>

        <ul className="flex flex-col gap-2">
          {seats.map((seat) => (
            <li
              key={seat.seatKey}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                seat.isYou
                  ? 'border-brand-600/50 bg-brand-500/10'
                  : 'border-ink-700/60 bg-ink-900/50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`truncate text-sm ${seat.isYou ? 'font-bold text-ink-100' : 'text-ink-200'}`}
                >
                  {seat.isBot ? t.group.seatEmpty : seat.companyName}
                </span>
                {seat.isYou ? <Badge tone="brand">{t.group.youBadge}</Badge> : null}
                {seat.isBot ? <Badge tone="neutral">{t.group.botBadge}</Badge> : null}
                {seat.studentName && !seat.isYou ? (
                  <span className="truncate text-xs text-ink-400">{seat.studentName}</span>
                ) : null}
              </span>

              {seat.isBot || completed ? null : (
                <Badge tone={seat.hasSubmitted ? 'good' : 'warn'}>
                  {seat.hasSubmitted ? t.group.statusSubmitted : t.group.statusWaiting}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {completed ? (
        <Card>
          <InfoNote>{t.group.completed}</InfoNote>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/group/${groupId}/report`}
              className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
            >
              {t.group.viewReport}
            </Link>
            {lastPlayedQuarter ? (
              <Link
                href={`/group/${groupId}/result/${lastPlayedQuarter}`}
                className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700"
              >
                {interpolate(t.group.viewResult, { quarter: lastPlayedQuarter })}
              </Link>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <CardTitle>
            {currentQuarter === null
              ? t.group.notStarted
              : interpolate(t.group.quarterRunning, { quarter: currentQuarter })}
          </CardTitle>

          {waiting.length === 0 ? (
            <InfoNote>{t.group.everyoneIn}</InfoNote>
          ) : (
            <WarningNote>
              {interpolate(t.group.waitingOn, {
                names: waiting.map((seat) => seat.studentName ?? seat.companyName).join(', '),
              })}
            </WarningNote>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {youHaveSubmitted ? (
              <p className="text-sm text-ink-300">{t.group.alreadySubmitted}</p>
            ) : (
              <Link
                href={`/group/${groupId}/decision`}
                className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brand-400"
              >
                {t.group.goDecide}
              </Link>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className="rounded-md border border-ink-600 bg-ink-800 px-5 py-2.5 text-sm text-ink-100 transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? t.group.refreshing : t.group.refresh}
            </button>
            {lastPlayedQuarter ? (
              <Link
                href={`/group/${groupId}/result/${lastPlayedQuarter}`}
                className="rounded-md border border-ink-600 px-5 py-2.5 text-sm text-ink-200 transition hover:bg-ink-800"
              >
                {interpolate(t.group.viewResult, { quarter: lastPlayedQuarter })}
              </Link>
            ) : null}
          </div>

          {error ? (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
