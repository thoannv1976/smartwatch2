import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COLLECTIONS } from '@/db/repositories/firestore';

/**
 * Guards the Firestore collection namespace.
 *
 * This exists because of a production failure that no other test could see.
 *
 * A Firestore `collectionGroup()` query selects by collection ID ALONE, at any
 * depth, under any parent. `listCoursesForStudent` — the first query the
 * student home page runs — is a collection-group query over `members`, the
 * subcollection holding a course roster. Part 2 then added group membership as
 * a subcollection of a group and called it `members` too.
 *
 * Both document shapes carry `uid` and `joinedAt`, so a `GroupMemberDoc`
 * matched the filter and the declared index exactly. But it has no `courseId`,
 * so the next line read `courses/undefined`, which Firestore rejects with a
 * thrown error rather than an empty result. The consequence: the moment a
 * student joined a group, their home page — the page they land on straight
 * after logging in — returned a server-side exception, and nothing else about
 * the account looked wrong.
 *
 * Nothing local catches this. The in-memory repository stores collections in a
 * flat map with no notion of paths, the Firestore emulator does not enforce
 * indexes, and `tsc`, lint and `next build` all see two perfectly valid string
 * constants. So the invariant is asserted on the constants themselves.
 */

describe('Firestore collection ids', () => {
  /**
   * NAMED, because this is the specific defect above.
   *
   * Two DIFFERENT keys sharing one collection id merges two document shapes
   * into a single collection group. Reusing ONE key under two parents is fine
   * and deliberate — `quarters` hangs off both `gameSessions` and `groupGames`
   * and holds the same `QuarterDoc` either way — which is why the assertion is
   * on the values of distinct keys, not on the shape of the tree.
   */
  it('collectionGroupIdIsUnique: no two collections share an id', () => {
    const entries = Object.entries(COLLECTIONS);
    const byId = new Map<string, string[]>();
    for (const [key, id] of entries) {
      byId.set(id, [...(byId.get(id) ?? []), key]);
    }

    const clashes = [...byId.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([id, keys]) => `${id} <- ${keys.join(', ')}`);

    expect(clashes).toEqual([]);
  });

  it('course rosters and group members live in different collection groups', () => {
    expect(COLLECTIONS.groupMembers).not.toBe(COLLECTIONS.courseMembers);
  });

  /**
   * The declared collection-group index is what makes the clash reachable: it
   * is the index the home-page query runs on, and it covers every `members`
   * collection in the database. If someone renames `courseMembers`, this index
   * stops serving that query and the page fails with FAILED_PRECONDITION
   * instead — silently in every local check, again.
   */
  it('the declared COLLECTION_GROUP index still names the course roster', () => {
    const file = readFileSync(path.resolve(__dirname, '../../firestore.indexes.json'), 'utf8');
    const declared = JSON.parse(file) as {
      indexes: { collectionGroup: string; queryScope: string; fields: { fieldPath: string }[] }[];
    };

    const groupScoped = declared.indexes.filter((i) => i.queryScope === 'COLLECTION_GROUP');
    expect(groupScoped.map((i) => i.collectionGroup)).toContain(COLLECTIONS.courseMembers);

    // Every collection-group index must belong to a collection we actually
    // declare, or it is indexing something that no longer exists.
    const known = new Set<string>(Object.values(COLLECTIONS));
    for (const index of groupScoped) {
      expect(known.has(index.collectionGroup)).toBe(true);
    }
  });
});
