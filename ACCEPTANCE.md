# Acceptance criteria (specification §17)

Status of each of the twenty build-checklist items, and how it was verified.

Verification types:
- **test** — an automated test in `npm test` (113 tests)
- **browser** — driven in Chromium against the Firebase Auth and Firestore
  emulators during development
- **manual** — needs a real GCP project; see the note at the end

| # | Criterion | Status | Verified by |
|---|---|---|---|
| 1 | Student can authenticate and access assigned games | Done | browser: sign up, sign in, Google provider wired; a student is redirected away from `/instructor` and `/admin` |
| 2 | Student can create a smartwatch company and product name | Done | browser: Create Company screen; test: rejects empty and >60-character names |
| 3 | Student can complete exactly six quarters | Done | browser: six quarters played end to end; test: a seventh submission is refused |
| 4 | Each quarter requires five investments totalling exactly 100 plus price index 80–120 | Done | test: `spec-required.test.ts` cases 1–2; browser: submit stays disabled until the total is exactly 100 |
| 5 | Five computer benchmark competitors participate every quarter | Done | test: every quarter stores six decisions and six result rows |
| 6 | AI competitors adapt to events and performance while keeping their personality | Done | test: `competitors.test.ts` — Garmin pushes product in Q2, Huawei cuts price in Q3, a negative margin raises price, low CSAT raises CX, and Apple stays priced above Huawei |
| 7 | Market events change the simulation exactly as configured | Done | test: each event's market size, weights and multipliers asserted against the spec §6 table |
| 8 | Same seed produces reproducible results | Done | test: byte-identical output for repeated runs, a different seed differs, and two sessions on one assignment seed produce identical six-quarter histories |
| 9 | All six company decisions and results are stored for every quarter | Done | test: `game-service.test.ts`; the quarter document holds six decisions, six results and the ranking |
| 10 | Student receives quarterly KPIs and a six-company ranking | Done | browser: quarter result screen with KPI tiles, deltas, ranking table and competitor intelligence |
| 11 | Final Score is calculated and stored | Done | test: written on the sixth submission, with the documented weights; browser: shown on the report |
| 12 | Official class leaderboard is generated | Done | test: lists only that assignment's completed results, best first, practice excluded; browser: sortable by five columns |
| 13 | Instructor can inspect each student's six-quarter history | Done | browser: student detail page with every decision beside the KPI it produced, plus the AI allocations |
| 14 | Instructor can export official results to CSV | Done | test: `csv-export.test.ts`; browser: both exports download with the right rows |
| 15 | Official quarter submissions are idempotent and server-authoritative | Done | test: a repeat submission returns the stored result, a tampered repeat is ignored, and three concurrent submissions produce one quarter |
| 16 | Simulation engine has automated tests | Done | 113 tests, including all thirteen the spec makes a release requirement |
| 17 | Application deploys to Cloud Run and connects securely to Cloud SQL | Adapted | The database is Firestore, not Cloud SQL, at your request. The runtime uses Application Default Credentials, so no key file exists. **Deployment itself is not verified here** — see the note below |
| 18 | Scenario and engine versions are stored on every session | Done | test: asserted on session creation and carried into every final result |
| 19 | No V1 feature requires real-time third-party market data | Done | The engine imports nothing and calls nothing; competitors are rule-based, not generative |
| 20 | Architecture supports converting 1 PLAYER + 5 AI into 6 PLAYER + 0 AI | Done | `simulateQuarter` takes an array of six companies and a decision map keyed by company; nothing in the engine refers to "the player" except the key used to look one up |

## Balance validation (§17.1)

`npm run balance` checks each criterion on both scenarios and all pass:

- Aggressive low pricing sells more units but damages profitability
- A premium strategy beats an undifferentiated price war and out-earns a
  balanced split
- High marketing with weak distribution leaves demand unfulfilled
- Product and technology investment compounds, with diminishing returns
- The allocation selling the most units is **not** the one with the best score
- The top twenty allocations do not all share one price index, so pricing stays
  a real decision
- The sampled strategies span more than 8 score points, enough to grade a class

These are also frozen as tests in `tests/simulation/balance.test.ts`, so a later
coefficient change cannot quietly break them.

## What is not verified here

**The actual Cloud Run deployment.** This environment has no GCP credentials,
and its network policy blocks Docker Hub, so the image could not be built or
pushed from here.

What *was* verified about the deployment path:

- `npm run build` produces the standalone output the Dockerfile ships
- that standalone output was assembled into the exact layout the container's
  final stage creates, started with the container's own command
  (`node server.js`), and driven through a complete six-quarter game — so the
  runtime artifact, the static and `public` copies and the start command are all
  known good
- `cloudbuild.yaml` runs typecheck and the test suite before building the image

The remaining step is running the commands in [DEPLOY.md](./DEPLOY.md) against
your project.
