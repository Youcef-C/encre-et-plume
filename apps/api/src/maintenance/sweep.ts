/**
 * F-25 — the one bounded-loop primitive every retention sweep runs on.
 *
 * Paging is by CURSOR on `id` (UUIDv7 → time-ordered, so `id > cursor` is monotonic and
 * index-backed), not by offset: an offset would drift as rows are deleted underneath it. The cursor
 * is the last FETCHED id, so a page that deletes nothing still advances and the loop cannot spin.
 */

/** ponytail: batch size — one round-trip per 1000 rows is the point where the loop stops mattering. */
export const SWEEP_PAGE = 1000;

/**
 * ponytail: per-sweep ceiling — 50 passes of SWEEP_PAGE is minutes, not hours. A backlog bigger
 * than this drains over consecutive nights instead of holding the worker until morning.
 */
export const SWEEP_RUN_CAP = 50_000;

/**
 * Scan at most SWEEP_RUN_CAP rows in pages of SWEEP_PAGE, deleting what `deletePage` dooms.
 *
 * @param fetchPage  returns up to SWEEP_PAGE rows ordered by `id`, after `cursor`.
 * @param deletePage deletes whatever of the page is garbage; returns how many rows it removed.
 * @returns total rows deleted this run.
 */
export async function sweepPaged<R extends { id: string }>(
  fetchPage: (cursor: string | null) => Promise<R[]>,
  deletePage: (rows: R[]) => Promise<number>,
): Promise<number> {
  let cursor: string | null = null;
  let scanned = 0;
  let deleted = 0;

  while (scanned < SWEEP_RUN_CAP) {
    const rows = await fetchPage(cursor);
    if (rows.length === 0) break;
    scanned += rows.length;
    cursor = rows[rows.length - 1].id; // the last FETCHED id, not the last deleted one
    deleted += await deletePage(rows);
    if (rows.length < SWEEP_PAGE) break;
  }

  return deleted;
}

/** `where` fragment that resumes after `cursor` (empty on the first page). */
export function afterCursor(cursor: string | null): { id?: { gt: string } } {
  return cursor === null ? {} : { id: { gt: cursor } };
}
