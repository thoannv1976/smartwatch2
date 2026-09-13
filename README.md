# Smartwatch CEO Challenge

A web-based business strategy simulation for university courses in E-Commerce,
Digital Business, Digital Marketing, MIS, Business Strategy and Digital
Transformation.

Each student runs a new smartwatch brand for six quarters against five
computer-controlled benchmark competitors. Every quarter they allocate exactly
100 strategy points across five investment areas and set a price index; the
market responds; the KPIs move; the ranking updates.

The lesson the game is built to teach: **the best strategy is not to maximise
one variable.** Product, technology, marketing, distribution, customer
experience and price have to hold together.

> The five benchmark brands are recognisable strategic archetypes used for
> teaching. Their in-game statistics are simulated educational values — not real
> market shares, financial results or live product data.

---

## What is here

| | |
|---|---|
| **Stack** | TypeScript, Next.js 15 (App Router), React 19, Tailwind CSS v4 |
| **Data** | Cloud Firestore, behind repository interfaces |
| **Auth** | Firebase Authentication (Google + email/password) → httpOnly session cookie |
| **Hosting** | Cloud Run, one deployable app (no microservices) |
| **Tests** | Vitest — 113 tests, no emulator or credentials required |
| **Languages** | Vietnamese (default) and English |

### The engine is the product

`src/domain/simulation/` is a **pure** module: no database, no network, no
React, no authentication. Given the same state, decisions, event and seed it
returns byte-identical results, on any machine, forever. That is what makes an
official assignment reproducible and an instructor's grade defensible.

It is written around an array of **six companies and six decision sets** — never
around "the human player" — so a future six-team multiplayer version reuses the
engine unchanged and only swaps how the six decisions are collected.

```
simulateQuarter({ quarter, companies, decisions, scenarioVersion, engineVersion, seed })
  → { companyResults, ranking, nextStates, eventKey, marketUnits, weights }
```

Every coefficient lives in versioned configuration (`config.ts`). Changing one
changes outcomes, so it requires a new engine version: completed sessions record
the version they were played on and are never recalculated.

### Server authority

The browser sends a decision. That is all it can send. Revenue, units, profit,
market share, scores and ranking are computed on the server and persisted before
anything comes back. The Firestore security rules deny the client SDK
everything, so this is enforced by the database rather than by convention.

Official quarters are **idempotent**: the quarter document is created inside a
transaction, so a double-click, a retry or three concurrent requests all yield
one stored result, never a second different one.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 113 tests
npm run balance      # the game-balance report
```

Firebase configuration is only needed to sign in and persist games — see
[DEPLOY.md](./DEPLOY.md), which also covers running against the local emulators.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (standalone output for Cloud Run) |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run balance` | Balance report for both scenarios |
| `npm run seed:demo` | Seed a demo course, assignment and played games (emulators or a throwaway project) |

### Internal simulation test mode

`/sim-test` (instructors and admins only) runs the engine in the browser with no
persistence: play a quarter or all six, inspect the five AI decisions, the event
modifiers, the demand weights and every intermediate value, reset, and compare
fixed strategies side by side. This is the tool for balancing the game.

---

## Game balance

`npm run balance` sweeps the strategy space and checks the release criteria. All
of them pass on both scenarios, **with every coefficient exactly as specified**.

Two findings came out of that work and are worth knowing:

**The profit score divisor stays at 500,000.** The specification invites tuning
it. Raising it makes price index 120 dominate all twenty top allocations, which
would delete the pricing decision entirely — so the specified value is also the
better one.

**In `smartwatch-v1` the player always finishes 6th of 6.** A sweep of 95,634
fixed allocations found no exception. The benchmarks start 30–40 points ahead on
four capabilities and also invest 100 points a quarter, so brand, CSAT and
innovation — 45% of the final score — cannot be caught in six quarters. Class
grading is unaffected (a 21-point spread separates the best and worst player
strategies), but the quarterly six-company rank is a constant.

Rather than change the specification's numbers, there is a second scenario:

| Scenario | Player starts as | Game rank |
|---|---|---|
| `smartwatch-v1` | Startup, exactly per spec table 2.4 | Always 6th |
| `smartwatch-v1-challenger` | Well-funded challenger | Best play reaches 3rd; a naive even split still finishes 6th |

Same engine, same formulas, same coefficients — only the player's starting row
differs. Instructors choose per assignment.

---

## Project layout

```
src/
  domain/simulation/   ★ pure engine — no DB, no network, no React
    types config random formulas events competitors engine scoring analysis game
  server/
    auth/              session cookies, role checks
    game/              orchestration, server actions, queries
    instructor/        analytics, CSV export, staff actions
  db/
    models             persisted document shapes
    repositories/      interfaces + Firestore and in-memory implementations
  app/                 routes (route groups gate by role)
  components/          ui, charts, game, instructor, chrome
  i18n/                vi (source of truth) and en
tests/
  simulation/          the 13 release-requirement tests + balance suite
  integration/         submit flow, idempotency, scoring, CSV
```

---

## Accessibility and visualisation

Charts follow one categorical palette in a fixed slot order, validated against
the app's chart surface for colour-vision deficiency separation, normal-vision
separation and 3:1 contrast. The player's own series additionally carries a
thicker stroke, a filled marker, a bold label and a "you" badge — identity is
never conveyed by colour alone. Every chart uses a single y axis.

## Not in Version 1

Real-time multiplayer, stock markets, factory or supply-chain management,
multiple SKUs, SKU-level inventory, multiple geographies, live market data,
generative-AI competitors, marketplace seller management, and auctions or
negotiation mechanics.

The competitors are rule-based on purpose. An LLM would be slower, cost money,
and — fatally for a graded assignment — would not be reproducible.
