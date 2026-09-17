import { NextResponse } from 'next/server';
import { getRepositories } from '@/db/repositories/firestore';
import { AuthorizationError, hasRole, requireRole } from '@/server/auth/session';
import { groupsToCsv, quartersToCsv, resultsToCsv } from '@/server/instructor/csv';
import { getGroupDetail, listGroupProgress, listLeaderboard } from '@/server/instructor/queries';

/**
 * CSV export for an assignment (spec 9.3).
 *
 * `?type=results`  — one row per completed session (the gradebook)
 * `?type=quarters` — one row per student per quarter (the audit trail)
 *
 * An instructor may only export assignments in a course they own; admins may
 * export any.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireRole('INSTRUCTOR');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.key }, { status: error.key === 'forbidden' ? 403 : 401 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const assignmentId = url.searchParams.get('assignmentId');
  const requestedType = url.searchParams.get('type');
  const type =
    requestedType === 'quarters' || requestedType === 'groups' ? requestedType : 'results';
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentNotFound' }, { status: 400 });
  }

  const repos = getRepositories();
  const assignment = await repos.assignments.get(assignmentId);
  if (!assignment) {
    return NextResponse.json({ error: 'assignmentNotFound' }, { status: 404 });
  }

  const course = await repos.courses.get(assignment.courseId);
  if (!hasRole(user.role, 'ADMIN') && course?.instructorId !== user.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const results = await listLeaderboard(assignmentId, 'finalScore');

  let csv: string;
  if (type === 'groups') {
    // Every group of this assignment, all six companies per quarter. Staff only
    // — this is the one export that carries exact allocations.
    const progress = await listGroupProgress(assignmentId);
    const details = await Promise.all(progress.map((row) => getGroupDetail(row.group.id)));

    csv = groupsToCsv(
      details
        .filter((detail): detail is NonNullable<typeof detail> => detail !== null)
        .map((detail) => ({
          groupName: detail.group.name,
          quarters: detail.quarters,
          members: detail.members.map((member) => ({
            seatKey: member.seatKey,
            studentCode: member.studentCode,
            displayName: member.displayName,
            email: member.email,
            companyName: member.companyName,
          })),
          defaults: detail.defaults,
          forecasts: detail.forecasts,
        })),
    );
  } else if (type === 'quarters') {
    const entries = await Promise.all(
      results.map(async (result) => ({
        studentCode: result.studentCode,
        displayName: result.displayName,
        companyName: result.companyName,
        quarters: await repos.sessions.listQuarters(result.sessionId),
        goldenUsedQuarters: result.goldenUsedQuarters,
      })),
    );
    csv = quartersToCsv(entries);
  } else {
    csv = resultsToCsv(results);
  }

  const safeTitle = assignment.title.replace(/[^\w-]+/g, '_').slice(0, 40);
  const filename = `${safeTitle || 'assignment'}-${type}.csv`;

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
