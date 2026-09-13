/**
 * Seeds a demo course, assignment and a few played games.
 *
 * Intended for the Firebase emulators or a throwaway project — it writes real
 * documents. Users must already exist (they are created by signing in), so pass
 * their emails; the script enrols whoever it finds.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GOOGLE_CLOUD_PROJECT=demo-smartwatch \
 *     npm run seed:demo -- instructor@example.edu student1@example.edu student2@example.edu
 */
import { getGameConfig, type QuarterDecision } from '../src/domain/simulation';
import { getRepositories } from '../src/db/repositories/firestore';
import { GameService } from '../src/server/game/service';

const STRATEGIES: { name: string; decision: QuarterDecision }[] = [
  {
    name: 'Innovator',
    decision: {
      productPoints: 30,
      technologyPoints: 30,
      marketingPoints: 15,
      distributionPoints: 10,
      cxPoints: 15,
      priceIndex: 110,
    },
  },
  {
    name: 'Growth',
    decision: {
      productPoints: 15,
      technologyPoints: 15,
      marketingPoints: 35,
      distributionPoints: 25,
      cxPoints: 10,
      priceIndex: 95,
    },
  },
  {
    name: 'Balanced',
    decision: {
      productPoints: 20,
      technologyPoints: 20,
      marketingPoints: 20,
      distributionPoints: 20,
      cxPoints: 20,
      priceIndex: 100,
    },
  },
];

async function main(): Promise<void> {
  const emails = process.argv.slice(2);
  if (emails.length < 2) {
    console.error(
      'Usage: npm run seed:demo -- <instructor-email> <student-email> [more student emails]',
    );
    process.exitCode = 1;
    return;
  }

  const [instructorEmail, ...studentEmails] = emails;
  const repos = getRepositories();
  const service = new GameService(repos);
  const config = getGameConfig();

  const instructor = await repos.users.getByEmail(instructorEmail!);
  if (!instructor) {
    console.error(
      `No user with email ${instructorEmail}. Everyone must sign in once before being seeded.`,
    );
    process.exitCode = 1;
    return;
  }
  await repos.users.setRole(instructor.uid, 'INSTRUCTOR');

  const course = await repos.courses.create({
    courseName: 'Digital Business — demo',
    semester: '2026A',
    instructorId: instructor.uid,
  });
  console.log(`course: ${course.courseName} (${course.id})`);

  const assignment = await repos.assignments.create({
    courseId: course.id,
    title: 'Demo assignment',
    startAt: Date.now() - 3_600_000,
    deadline: Date.now() + 30 * 86_400_000,
    maxAttempts: 1,
    scenarioVersion: config.scenarioVersion,
    engineVersion: config.engineVersion,
    officialSeed: 'smartwatch-v1-2026',
    isOpen: true,
    createdBy: instructor.uid,
  });
  console.log(`assignment: ${assignment.title} (${assignment.id})`);

  for (const [index, email] of studentEmails.entries()) {
    const student = await repos.users.getByEmail(email);
    if (!student) {
      console.warn(`skipping ${email}: no such user (they must sign in once first)`);
      continue;
    }

    await repos.courses.addMember({
      uid: student.uid,
      courseId: course.id,
      studentCode: `SV${String(index + 1).padStart(3, '0')}`,
      displayName: student.displayName,
      email: student.email,
    });

    const strategy = STRATEGIES[index % STRATEGIES.length]!;
    const session = await service.createSession({
      userId: student.uid,
      displayName: student.displayName,
      email: student.email,
      mode: 'OFFICIAL',
      assignmentId: assignment.id,
      companyName: `${strategy.name} Watch`,
      productName: `${strategy.name} One`,
      positioning: 'BALANCED',
    });

    for (let quarter = 1; quarter <= config.quarters; quarter += 1) {
      await service.submitQuarter(session.id, student.uid, quarter, strategy.decision);
    }

    const result = await repos.finalResults.get(session.id);
    console.log(
      `  ${email}: ${strategy.name} → score ${result?.finalScore.toFixed(2) ?? '?'}, rank ${result?.gameRank ?? '?'}`,
    );
  }

  console.log('\nDone. Sign in as the instructor to see the assignment dashboard.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
