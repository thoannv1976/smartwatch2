import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PLAYER_COMPANY_KEY,
  awardAchievements,
  forecastAccuracy,
  getGameConfig,
} from '@/domain/simulation';
import { requireUserPage } from '@/server/auth/guards';
import { getRepositories } from '@/db/repositories/firestore';
import { quarterForecast } from '@/db/models';
import { createGameService } from '@/server/game/service';
import { isGameError } from '@/server/game/errors';
import { getClassRank } from '@/server/game/queries';
import { getTranslations } from '@/i18n/server';
import { interpolate } from '@/i18n';
import { PrintButton } from '@/components/ui/PrintButton';
import { formatDateOnly, formatDecimal } from '@/lib/format';

export const metadata = { title: 'Chứng nhận — Smartwatch CEO Challenge' };

/**
 * A certificate for a finished tenure.
 *
 * Its own page rather than a section of the report, for one reason: it has to
 * print onto ONE sheet, and the report is eleven cards long. Here the whole
 * document is the page, so the existing `@media print` rules produce a clean
 * single page with no cropping and nothing to configure.
 *
 * WHAT IT DOES NOT CLAIM. It certifies completing a teaching simulation and
 * says so on its face. Overstating that would be the one genuinely harmful
 * thing this feature could do: a student should not be able to wave this at an
 * employer as a qualification, and the disclaimer is not fine print — it is on
 * the certificate, in the printed output, at readable size.
 *
 * The session id, scenario and engine version are printed so an instructor can
 * check a submitted copy against the database rather than taking it on trust.
 */
export default async function CertificatePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUserPage(`/report/${sessionId}/certificate`);
  const { t, locale } = await getTranslations();

  const repos = getRepositories();
  const service = createGameService(repos);

  let session;
  try {
    session = await service.getOwnedSession(sessionId, user.uid);
  } catch (error) {
    if (isGameError(error)) notFound();
    throw error;
  }

  const config = getGameConfig(session.scenarioVersion);
  const quarters = await service.listQuarters(sessionId);
  // A certificate for an unfinished tenure would be a certificate for nothing.
  if (quarters.length < config.quarters) notFound();

  const scores = service.scoreSession(session, quarters);
  const playerScore = scores.find((s) => s.companyKey === PLAYER_COMPANY_KEY);
  if (!playerScore) notFound();

  const storedResult = await repos.finalResults.get(sessionId);
  const classRank = storedResult ? await getClassRank(storedResult) : null;

  const entries = quarters
    .map((q) => {
      const result = q.results.find((r) => r.companyKey === PLAYER_COMPANY_KEY);
      const decision = q.decisions[PLAYER_COMPANY_KEY];
      return result && decision
        ? { quarter: q.quarter, eventKey: q.eventKey, weights: q.weights, decision, result }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const forecast = forecastAccuracy(
    entries.map((entry) => ({
      forecast: quarterForecast(quarters.find((q) => q.quarter === entry.quarter)!),
      result: entry.result,
    })),
  );

  const achievements = awardAchievements({
    quarters: entries,
    score: playerScore,
    config,
    forecastIndex: forecast?.index ?? null,
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <PrintButton />
        <Link
          href={`/report/${sessionId}`}
          className="rounded-md border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-ink-100 transition hover:bg-ink-700"
        >
          {t.report.title}
        </Link>
      </div>

      <article className="rounded-2xl border-2 border-brand-600/40 bg-ink-900/60 px-8 py-12 text-center sm:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
          {t.common.appName}
        </p>
        <h1 className="mt-6 text-2xl font-bold tracking-wide text-ink-100 sm:text-3xl">
          {t.certificate.heading}
        </h1>
        <p className="mt-2 text-sm text-ink-400">{t.certificate.subheading}</p>

        <p className="mt-10 text-sm text-ink-400">{t.certificate.awardedTo}</p>
        <p className="mt-1 text-xl font-bold text-ink-100 sm:text-2xl">
          {user.displayName || user.email}
        </p>

        <p className="mt-6 text-sm text-ink-400">{t.certificate.hasCompleted}</p>
        <p className="mt-1 text-lg font-semibold text-ink-100">{session.companyName}</p>
        <p className="text-sm text-ink-400">{session.productName}</p>

        <dl className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-ink-400">{t.certificate.finalScoreLabel}</dt>
            <dd className="tnum mt-1 text-2xl font-bold text-ink-100">
              {formatDecimal(playerScore.finalScore, locale, 1)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">{t.certificate.rankLabel}</dt>
            <dd className="tnum mt-1 text-2xl font-bold text-ink-100">
              {playerScore.gameRank}/{scores.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">{t.certificate.classRankLabel}</dt>
            <dd className="tnum mt-1 text-2xl font-bold text-ink-100">
              {classRank ? `${classRank.rank}/${classRank.total}` : '—'}
            </dd>
          </div>
        </dl>

        {achievements.length > 0 ? (
          <div className="mt-10">
            <p className="text-xs uppercase tracking-wide text-ink-400">
              {t.certificate.achievementsLabel}
            </p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {achievements.map((achievement) => (
                <li
                  key={achievement.key}
                  className="rounded-full border border-ink-600 px-3 py-1 text-xs text-ink-200"
                >
                  {t.achievementName[achievement.key]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-10 text-sm text-ink-300">
          {t.certificate.issued} {formatDateOnly(session.completedAt ?? Date.now(), locale)}
        </p>

        {/* Printed so an instructor can check a submitted copy against the
            database rather than taking a piece of paper on trust. */}
        <p className="mt-6 font-mono text-[10px] leading-relaxed text-ink-500">
          {interpolate(t.certificate.verify, {
            sessionId,
            scenario: session.scenarioVersion,
            engine: session.engineVersion,
          })}
        </p>
        <p className="mx-auto mt-3 max-w-prose text-[11px] leading-relaxed text-ink-500">
          {t.certificate.disclaimer}
        </p>
      </article>
    </main>
  );
}
