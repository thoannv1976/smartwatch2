import type { guideVi } from './guide.vi';

/**
 * English content for the student guide.
 *
 * Typed against `guideVi`, so a missing, extra or misspelled key fails the
 * build — the same guarantee `en.ts` gets from `vi.ts`. Numbers must match
 * `config.ts` / `formulas.ts` / `scoring.ts`; `tests/i18n/guide.test.ts` checks
 * them against the real coefficients rather than against a copy.
 */
export const guideEn: typeof guideVi = {
  title: 'About & How to play',
  subtitle: 'You are about to run a smartwatch company for six quarters. Here is everything worth knowing first.',
  backHome: 'Back to home',
  signIn: 'Sign in',
  tocTitle: 'Contents',

  // --- 1. Introduction -----------------------------------------------------
  intro: {
    title: 'What this game is',
    lead: 'You are the CEO of a new smartwatch company. Six quarters, one decision each, and a market with five other companies competing against you.',
    body: 'Each quarter you allocate exactly 100 strategy points across five areas — Product, Technology, Digital Marketing, Distribution, Customer Experience — and pick a price. The market runs, the results come back, and the capability you built carries into the next quarter. After six quarters you are scored on five components and ranked against your class.',
    numbersTitle: 'The fixed numbers',
    numbersHint: 'Identical for every student in every class. These are the things you can rely on.',
    quartersLabel: 'Quarters',
    quartersValue: '6',
    pointsLabel: 'Strategy points per quarter',
    pointsValue: '100 (all of them, exactly)',
    priceLabel: 'Price index',
    priceValue: '80–120, around a $300 reference price',
    marketLabel: 'Base market size',
    marketValue: '500,000 units per quarter',
    cashLabel: 'Starting cash',
    cashValue: '$5,000,000',
    companiesLabel: 'Companies in the market',
    companiesValue: '6 (you and five rivals)',

    deterministicTitle: 'The market is not a dice roll',
    deterministicBody: 'The engine is deterministic: the same seed gives the same market, and the same decision gives the same result — today, tomorrow, or when your instructor re-checks it. There is a seeded ±2% demand jitter so the market is not perfectly flat, but it is identical for everyone sharing a seed. You win or lose on decisions, not on luck.',

    honestTitle: 'One thing to be straight about before you play',
    honestBody: 'In the default scenario you start as a startup: brand 30, product 50, technology 50, distribution 40. The five rivals are established brands: brand 70–90, and every other capability 30–40 points ahead of you. They also invest 100 points a quarter, exactly as you do.',
    honestConsequence: 'The consequence, measured rather than guessed: a sweep of 95,634 allocations found the player finishing 6th of 6 in EVERY one of them. Brand, satisfaction and innovation are 45% of the final score between them, and six quarters is not enough to close a 30–40 point capability gap.',
    honestPoint: 'So do not use your rank in the market as a measure of yourself. Your score is compared with your classmates, not with Apple. The gap between the best and worst allocation in that same sweep was 32 points — that is what is actually graded, and it is entirely in your hands. If you want a scenario where playing well reaches 3rd place, ask your instructor about the Challenger version.',
  },

  // --- 2. Value ------------------------------------------------------------
  value: {
    title: 'What you get out of it',
    lead: 'Not entertainment, and not formulas to memorise. These five things are why this exercise exists.',
    tradeoffTitle: 'Trade-offs are what strategy is',
    tradeoffBody: '100 points is finite. Every point into Marketing is a point not into Distribution. No allocation is good at everything, so "strategy" here is not choosing what is good — it is choosing what you are willing to give up.',
    causalTitle: 'Reading numbers back to their causes',
    causalBody: 'Every quarter hands you a table and a question: why did it come out like that? Did profit fall because of price, cost, or returns? Share rose but margin thinned — is that winning or losing? This skill transfers directly to every real business report.',
    calibrationTitle: 'Calibrating your own judgement',
    calibrationBody: 'Before each quarter you have to call where you will place. It is not graded, but after six quarters you know whether you habitually over- or underestimate yourself. Very few exercises tell you that about yourself.',
    incompleteTitle: 'Deciding without enough information',
    incompleteBody: 'The system deliberately shows no profit forecast, and you never see a rival\'s allocation. You commit under incomplete information — like a real executive, and unlike a problem set with the answers in the back.',
    peopleTitle: 'Competing against real people',
    peopleBody: 'In Part 2 the five rivals are five classmates reading you while you read them. There is no optimal answer, because their decisions do not exist yet while you are deciding.',
  },

  // --- 3. How to play ------------------------------------------------------
  howTo: {
    title: 'How to play',
    part1Title: 'Part 1 — Solo play',
    part2Title: 'Part 2 — Group competition, six students',
    stepLabel: 'Step {n}',

    s1Title: 'Join your class',
    s1Body: 'Press "Find a class to join" on the home page, pick your class and enter your student code. Until you are in a class you will see no official assignments.',
    s2Title: 'Play a practice game first — seriously',
    s2Body: 'Practice is unlimited and never reaches the leaderboard. Play one full practice game before touching an official assignment: an official assignment usually allows a single attempt, and there is no undo.',
    s3Title: 'Found your company',
    s3Body: 'Name the company, name the product, and pick one of six positionings. Positioning does not change any formula — it is a statement of intent, and your final report checks whether the six quarters you played match what you said you would do.',
    s4Title: 'The CEO dashboard',
    s4Body: 'Where you see your current capabilities, last quarter\'s results, the six-company ranking, and the upcoming market event. Read the event before you open the decision screen — it tells you what the market is paying for this quarter.',
    s5Title: 'Decide — the screen that matters most',
    s5Body: 'Five sliders and a price index. Submit only unlocks when the total is exactly 100. Three tools help on the way: three strategy suggestions with their reasoning (tap to fill the inputs, still editable), the Golden Strategy which searches for the best plan for that one quarter — limited to 2 uses per game, and risk warnings that update as you type.',
    s5Warning: 'The system deliberately shows NO profit forecast, and your decision LOCKS ONCE SUBMITTED. Think before you press.',
    s6Title: 'Your prediction',
    s6Body: 'Before you commit, pick where you think you will place — one tap, required. Two optional boxes follow: the market share you expect and one line of reasoning. The prediction cannot change the outcome and is not graded; it exists so that later you can see how well you read the market.',
    s7Title: 'Read the quarter result',
    s7Body: 'Every KPI with its change on the previous quarter, press coverage and customer reviews of your company, your prediction against reality, notes on the decision you just made, and a letter from the board carrying exactly one thing to do next quarter.',
    s8Title: 'The final report',
    s8Body: 'After quarter 6: your final score and how it was built, a tenure review, your reading-the-market index, your position in the class, 12 achievements (including the ones you did not earn, with their conditions), a quarter-by-quarter "what you should have done" table, and a printable certificate.',

    g1Title: 'Get your group code',
    g1Body: 'Your instructor gives your group a six-character code. Enter it, name your own company, and you are given one of the six seats.',
    g2Title: 'The waiting room',
    g2Body: 'Six seats, who has joined, who has submitted this quarter, and who everyone is waiting on — by name. The quarter runs when all six have submitted, or when the instructor runs it.',
    g3Title: 'Deciding inside a group',
    g3Body: 'The same five sliders, the same three suggestions, the same risk warnings, the same prediction box. One large difference: submitting is final, and five people are waiting on you.',
    g4Title: 'Three tools instead of the Golden Strategy',
    g4Body: 'Reading the competition (notes built from published data), the positioning map (selling price against satisfaction for all six companies), and the practice bench (try an allocation before you commit).',
    g5Title: 'Results and the group report',
    g5Body: 'After each quarter: your result plus the six-company head-to-head. After six: your rank in the group, the score gap to the leader, and how all six companies moved over time.',

    goldenOffTitle: 'Why the Golden Strategy is off in group mode',
    goldenOffBody: 'In solo play the optimiser can find the best plan because it knows the five bots\' decisions in advance — they come from the seed and do not depend on you. With five real people, those five decisions DO NOT EXIST while you are deciding. There is no way to make it honest, and pretending otherwise would teach something false. So the button is gone, and the screen says why rather than quietly hiding it.',
  },

  // --- 4. Lessons ----------------------------------------------------------
  lessons: {
    part1Title: 'What you learn from Part 1',
    part2Title: 'What you learn from Part 2',
    questionsHint: 'These are the questions worth carrying with you while you play. The answers open once you have played.',
    lockedPart1: 'Answers open once you finish all six quarters of any game — a practice game counts.',
    lockedPart2: 'Answers open once you finish a six-quarter group match.',
    unlockedNote: 'You have played this part, so the answers are open.',
    whyLocked: 'Why they are locked: read "distribution is the bottleneck" in advance and you will never walk into it yourself — and walking into it is what makes a simulation worth more than a reading.',
    answerLabel: 'What is going on',
  },

  part1: {
    questions: {
      unitsNotVictory: 'Why can selling the most units still not be winning?',
      distributionCap: 'Why do some quarters have customers who wanted to buy and could not?',
      priceNeedsBrand: 'Why does the same price work for one company and not another?',
      compounding: 'A point invested in quarter 1 versus quarter 6 — which is worth more?',
      readWeights: 'What is the market paying for this quarter, and how would you know?',
      hiddenReturns: 'Why is revenue healthy while profit stays thin?',
      cashDiscipline: 'What happens when you run out of cash?',
      steadyVsAdapt: 'Should you hold one strategy or change every quarter?',
    },
    answers: {
      unitsNotVictory: 'Because units sold is not one of the score components. The final score is five weighted things: profit 30%, market share 25%, brand 15%, customer satisfaction 15%, innovation 15%. Selling cheaply in volume buys share but attacks profit — the heaviest component of all. A company selling less while holding its margin, its brand and its satisfaction scores higher.',
      distributionCap: 'Because distribution is a hard ceiling, not a bonus. The share of demand you can actually serve is 0.70 + 0.003 × Distribution, capped at 1.00. At distribution 40 — exactly where you start — you serve only 82% of the demand you created. The rest is customers who wanted to buy and could not: revenue you had already won and did not collect. That is why loading Marketing while neglecting Distribution is the most expensive mistake in this game.',
      priceNeedsBrand: 'Because price is never judged on its own. Buyers weigh price attractiveness alongside product, technology, brand and experience — and brand alone is 20% of the purchase decision at the default weights. Pricing high on a weak brand means asking for a premium you have nothing to justify yet. The reverse also holds: a strong brand lets you charge more and keep the customer.',
      compounding: 'Quarter 1, by a wide margin. Capability carries forward, so a product point spent in quarter 1 works for you for six quarters while a point spent in quarter 6 works once. Investment also has diminishing returns: the same point moves a capability sitting at 30 far more than one already at 80. Build early, and build where you are weak.',
      readWeights: 'Six purchase factors each carry a weight, and the defaults are product 30%, price 20%, brand 20%, marketing 15%, distribution 10%, experience 5%. Each quarter\'s market event shifts that set — the price-competition quarter pushes price to 30%, the AI quarter multiplies technology\'s contribution by 1.4. The decision screen shows the current quarter\'s weights, and the end-of-quarter review tells you what percentage your allocation matched them. Investing in line with the weights is the cheapest score there is.',
      hiddenReturns: 'Because two things erode profit that the revenue line does not mention. First, unit cost rises with the very quality and technology you build — a better watch costs more to make. Second, the return rate: 0.10 − 0.0003 × Quality − 0.0003 × Experience, bounded between 4% and 10%. Neglecting quality and experience means paying the full 10% for six quarters, and every return is a unit you paid to build and did not keep the revenue for.',
      cashDiscipline: 'Cash is an absolute constraint. Every quarter you pay a fixed strategic investment and a fixed operating cost regardless of what you sell. A company out of money has no options left, including the right ones. The lesson is not "spend less" — it is that every investment needs a route back to revenue within the quarters you have left, and by quarter 5 or 6 that route is very short.',
      steadyVsAdapt: 'They are two separate axes, not two ends of one, and the final report scores them separately. Consistency measures how much you reshuffle between quarters; adaptation measures how well your allocation matched each quarter\'s demand weights. The strongest players are usually consistent in direction (they know what they are building) and adaptive in tactics (they shift points with the event). Reshuffling constantly is drift; changing nothing across six quarters is not reading the market at all.',
    },
  },

  part2: {
    questions: {
      noOptimizer: 'Why can there be no "find the best plan" button in group mode?',
      incompleteInfo: 'What do you actually know about your rivals, and what do you not?',
      emptySpace: 'Should you move into the crowd or into the gap on the positioning map?',
      priceWar: 'Three of five rivals just cut their price. What should you do?',
      slowestMember: 'Why can your group be stuck even though you submitted?',
      sameStart: 'All six companies start identically — so what creates the difference?',
    },
    answers: {
      noOptimizer: 'Because an optimal answer needs to know what the rivals will do, and here those five decisions do not exist yet. In solo play the five bots come from the seed and do not depend on you, so a computer can try every combination against them. With five real people deciding at the same time as you — and guessing at you — the problem has no fixed answer. That is not a technical limitation; it is precisely what makes real competition different from an optimisation exercise.',
      incompleteInfo: 'You see everything the market publishes: units, revenue, profit, share, satisfaction and rank for all six companies. Dividing revenue by units gives you their average selling price. You NEVER see their point allocations, and they never see yours — even the practice bench deliberately runs against five copies of your own company, so nobody can reverse-engineer a group-mate\'s decision from it. The craft here is inferring intent from outcomes, not seeing the cards.',
      emptySpace: 'The gap, almost always. The positioning map puts all six companies on selling price against satisfaction. When three companies crowd into one corner they share the same customers and drag each other\'s margins down. An empty area means a group of buyers nobody is serving. Differentiation is not a slogan — it is the only way to stop competing on price.',
      priceWar: 'Almost certainly do NOT follow them down. When the whole market cuts price, nobody gains meaningful share and everybody loses margin — and profit is 30% of the final score, the heaviest component. A race to the bottom ends with everyone poorer. That quarter is usually the one to go somewhere else: quality, brand, or the customers the discounters just abandoned.',
      slowestMember: 'Because the market only runs when all six seats have submitted. That is a deliberate choice: there is no automatic deadline that submits a decision you did not make. The cost is that one person going missing blocks the other five, which is why the waiting room names who is missing — so the group goes and finds them. Your instructor can run the quarter anyway, and any substituted decision is clearly flagged in the report so nobody is marked unfairly. The lesson outside the game: coordination is a real constraint, and it belongs to everyone in the group, not only to the slowest person.',
      sameStart: 'Only the decisions. In group mode all six seats begin with exactly the same row — brand 30, product 50, technology 50, distribution 40, experience 50 — and the same $5,000,000. That is on purpose: on the solo scenario, whoever was seated as an established brand would win because of the seat rather than the play. We measured it: with six identical strategies, solo seating produced a 24-point spread while group mode produced under half a point. So when the match ends and six companies are far apart, that distance is six people, not six starting lines.',
    },
  },

  // --- 5. Closing ----------------------------------------------------------
  closing: {
    title: 'One last thing',
    body: 'There will be a quarter where you do everything right and still drop a place, because five other people also did everything right. That is not a bug — that is a market. What this exercise measures is not whether you won, but whether you understand why the result came out the way it did. Use the reasoning box every quarter: the six sentences you write yourself will be the most valuable part of your final report.',
    startPractice: 'Start a practice game',
    goHome: 'Go to home',
  },
};
