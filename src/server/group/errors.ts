import type { Dictionary } from '@/i18n';

/**
 * Refusals the group screens are allowed to show.
 *
 * Deliberately the SAME dictionary section the solo game uses: a student who
 * sees "the deadline has passed" should read the same sentence whichever mode
 * they are in, and one list of error keys means the i18n parity test covers
 * both modes at once.
 */
export type GroupErrorKey = keyof Dictionary['errors'];

export class GroupError extends Error {
  constructor(readonly key: GroupErrorKey) {
    super(key);
    this.name = 'GroupError';
  }
}

export function isGroupError(error: unknown): error is GroupError {
  return error instanceof GroupError;
}
