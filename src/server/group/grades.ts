import 'server-only';
import { sendGradeQuietly } from '@/server/lti/runtime';
import type { GroupService } from './service';

/**
 * Once a match is over, sends each student's score to the LMS gradebook.
 *
 * Only students who opened the assignment from Moodle have a grade target, and
 * the LTI grade log makes a repeated call free, so this is safe to call from
 * every path that might have just finished the match (the last submission, a
 * waiting-room refresh, or the instructor forcing the last quarter).
 *
 * Kept out of the `'use server'` action files on purpose: every export there
 * becomes an endpoint a browser can call.
 */
export async function sendGroupGradesQuietly(service: GroupService, groupId: string): Promise<void> {
  const state = await service.getState(groupId);
  if (!state.completed) return;
  for (const member of state.members) {
    await sendGradeQuietly(`${groupId}__${member.seatKey}`);
  }
}
