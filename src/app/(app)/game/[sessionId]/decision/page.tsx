import { notFound, redirect } from 'next/navigation';
import {
  PLAYER_COMPANY_KEY,
  getGameConfig,
  getMarketEvent,
  type QuarterDecision,
} from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { createGameService } from '@/server/game/service';
import { isGameError } from '@/server/game/errors';
import { getTranslations } from '@/i18n/server';
import { DecisionScreen } from '@/components/game/DecisionScreen';
import { Card, CardTitle, PageHeader } from '@/components/ui/primitives';
import { formatInteger } from '@/lib/format';

export const metadata = { title: 'Quyết định chiến lược — Smartwatch CEO Challenge' };

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUserPage(`/game/${sessionId}/decision`);
  const { t, locale } = await getTranslations();

  const service = createGameService(getRepositories());
  let session;
  try {
    session = await service.getOwnedSession(sessionId, user.uid);
  } catch (error) {
    if (isGameError(error)) notFound();
    throw error;
  }

  const config = getGameConfig(session.scenarioVersion);
  const quarter = session.currentRound + 1;

  // Nothing left to decide.
  if (quarter > config.quarters) redirect(`/report/${sessionId}`);

  const event = getMarketEvent(quarter, config, session.randomSeed);
  const player = session.companies.find((c) => c.companyKey === PLAYER_COMPANY_KEY);
  if (!player) notFound();

  // The coach reads the same stored quarters the result screens read, so its
  // advice is about the game that actually happened, not a re-simulation.
  const quarters = await service.listQuarters(sessionId);
  const suggestions = service.suggestionsFor(session, quarters);
  const previousDecisions = quarters
    .sort((a, b) => a.quarter - b.quarter)
    .map((q) => q.decisions[PLAYER_COMPANY_KEY])
    .filter((d): d is QuarterDecision => Boolean(d));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`${t.common.quarterShort}${quarter} · ${t.decision.title}`}
        subtitle={session.companyName}
      />

      <Card>
        <CardTitle>
          {t.dashboard.marketEvent}: {t.events[event.key]}
        </CardTitle>
        <p className="max-w-prose text-sm text-ink-300">{t.eventDesc[event.key]}</p>
        <p className="tnum mt-2 text-xs text-ink-400">
          {t.dashboard.marketSize}: {formatInteger(event.marketUnits, locale)} {t.dashboard.units}
        </p>
      </Card>

      <DecisionScreen
        sessionId={sessionId}
        quarter={quarter}
        scenarioVersion={session.scenarioVersion}
        capabilities={{
          productQuality: player.productQuality,
          technology: player.technology,
          distribution: player.distribution,
          customerExperience: player.customerExperience,
        }}
        isOfficial={session.mode === 'OFFICIAL'}
        playerState={player}
        suggestions={suggestions}
        goldenUsedQuarters={service.goldenUses(session)}
        previousDecisions={previousDecisions}
      />
    </main>
  );
}
