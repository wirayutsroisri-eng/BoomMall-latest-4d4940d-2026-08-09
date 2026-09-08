/**
 * Keyset ("seek") pagination helper — same shape as the cursor convention
 * already used in ChatService.ts (cursorWhere): the client passes the id of
 * the last row it saw, the server resolves that row's sort-key value, and
 * builds a compound (sortField, id) WHERE so paging stays correct even while
 * rows are being inserted/updated concurrently (no OFFSET drift at scale).
 */

export type CursorDirection = 'asc' | 'desc';

export type SortCursor = {
  value: Date | number;
  id: string;
};

/** Prisma `where` fragment for "rows strictly after this cursor" in the given sort direction. */
export function cursorWhere(sortField: string, cursor: SortCursor, dir: CursorDirection) {
  const cmp = dir === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [sortField]: { [cmp]: cursor.value } },
      { [sortField]: cursor.value, id: { [cmp]: cursor.id } },
    ],
  };
}

/** Prisma `orderBy` fragment matching cursorWhere's tie-break. */
export function cursorOrderBy(sortField: string, dir: CursorDirection) {
  return [{ [sortField]: dir }, { id: dir }];
}

/** Splits an over-fetched page (`take: limit + 1`) into the page + next cursor id. */
export function paginate<T>(
  rows: T[],
  limit: number,
  getId: (row: T) => string = (row) => (row as { id: string }).id,
): { items: T[]; nextCursor: string | null } {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, nextCursor: getId(items[items.length - 1]) };
  }
  return { items: rows, nextCursor: null };
}
