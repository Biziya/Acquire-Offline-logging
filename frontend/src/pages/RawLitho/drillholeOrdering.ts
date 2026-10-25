import type { Drillhole } from "../../types/domain";
import { columns } from "../../types/rawLithoSchema";
import { isRecord } from "../../types/validation";
/*
 * Drillhole selector ordering — the only place that decides the order.
 *
 * The list is built as:
 *   1. Recent Working Drillholes: up to 3 drillholes with saved Raw Litho
 *      data in IndexedDB, most recently worked on first,
 *   2. All Drillholes: every other drillhole, newest first — including
 *      drillholes with saved data that are not among those 3.
 *
 * A drillhole is never listed twice and never left out.
 *
 * "Most recently worked on": the selection history (most recent first) is
 * the order, but only drillholes with a saved draft count — a selection alone
 * proves nothing. Drafts not in the history follow, latest `modified_at`
 * first.
 *
 * NEWEST FIRST: `/api/drillholes` (and the IndexedDB cache that mirrors it)
 * hands the records over oldest first, so newest first is that order reversed.
 * The records carry no date field, so this is the only signal available. If the
 * API ever returns a date, `sortDrillholesByNewestFirst` is the single function
 * to change.
 */

export const RECENT_DRILLHOLE_LIMIT = 3;
/* Selections remembered, so a working drillhole keeps its place after a few
   selections of drillholes without data. */
export const SELECTION_HISTORY_LIMIT = 20;

function normalizeHoleId(holeId: string) {
  return holeId.trim();
}

/* Trims, drops blanks and duplicates, and keeps at most `limit` entries. */
export function normalizeRecentHoleIds(
  holeIds: readonly string[],
  limit = RECENT_DRILLHOLE_LIMIT,
) {
  const seenHoleIds = new Set<string>();
  const normalizedHoleIds = [];

  for (const holeId of holeIds) {
    const normalizedHoleId = normalizeHoleId(holeId);

    if (!normalizedHoleId || seenHoleIds.has(normalizedHoleId)) continue;

    seenHoleIds.add(normalizedHoleId);
    normalizedHoleIds.push(normalizedHoleId);

    if (normalizedHoleIds.length === limit) break;
  }

  return normalizedHoleIds;
}

/*
 * Records a selection. The hole moves to the front, so selecting one that is
 * already in the list reorders it instead of duplicating it, and the oldest
 * entry falls off the end.
 */
export function addRecentHoleId(
  recentHoleIds: readonly string[],
  holeId: string,
  limit = RECENT_DRILLHOLE_LIMIT,
) {
  const normalizedHoleId = normalizeHoleId(holeId);
  const currentHoleIds = recentHoleIds;

  if (!normalizedHoleId) return normalizeRecentHoleIds(currentHoleIds, limit);

  return normalizeRecentHoleIds([normalizedHoleId, ...currentHoleIds], limit);
}

export function haveSameHoleIds(
  firstHoleIds: readonly string[],
  secondHoleIds: readonly string[],
) {
  return (
    firstHoleIds.length === secondHoleIds.length &&
    firstHoleIds.every((holeId, index) => holeId === secondHoleIds[index])
  );
}

/*
 * True when a stored draft holds real work: at least one row with a value
 * other than its column's default. A blank document (one empty row) is not
 * working data.
 */
export function hasWorkingData(draft: unknown) {
  if (!isRecord(draft) || !Array.isArray(draft.rows)) return false;

  return draft.rows.some(
    (row) =>
      isRecord(row) &&
      columns.some((column) => {
        const value = row[column.key];
        return typeof value === "string" && value.trim() !== "" && value !== column.defaultValue;
      }),
  );
}

/*
 * Up to 3 drillholes with saved data, most recently worked on first.
 * `workingDrafts` maps each such drillhole to its draft's `modified_at`.
 */
export function pickRecentWorkingHoleIds(
  selectionHistory: readonly string[],
  workingDrafts: ReadonlyMap<string, string>,
) {
  const byLastEdit = [...workingDrafts]
    .sort(([firstHoleId, first], [secondHoleId, second]) =>
      second.localeCompare(first) || firstHoleId.localeCompare(secondHoleId),
    )
    .map(([holeId]) => holeId);

  return normalizeRecentHoleIds([
    ...selectionHistory.filter((holeId) => workingDrafts.has(normalizeHoleId(holeId))),
    ...byLastEdit,
  ]);
}

export function sortDrillholesByNewestFirst(drillholes: readonly Drillhole[]) {
  return [...drillholes].reverse();
}

/*
 * The selector's list: the promoted drillholes first (`recentCount` of them,
 * only those still in the list), then every other drillhole newest first.
 */
export function orderDrillholes(
  drillholes: readonly Drillhole[],
  recentHoleIds: readonly string[],
) {
  const newestFirst = sortDrillholesByNewestFirst(drillholes);
  const recentHoleIdList = normalizeRecentHoleIds(recentHoleIds);

  if (recentHoleIdList.length === 0) return { drillholes: newestFirst, recentCount: 0 };

  const drillholeByHoleId = new Map(
    newestFirst.map((drillhole) => [drillhole.holeId, drillhole]),
  );

  // A remembered hole that is no longer in the list is simply skipped.
  const recentDrillholes = recentHoleIdList
    .map((holeId) => drillholeByHoleId.get(holeId))
    .filter((hole): hole is Drillhole => hole !== undefined);

  const promotedHoleIds = new Set(
    recentDrillholes.map((drillhole) => drillhole.holeId),
  );

  return {
    drillholes: [
      ...recentDrillholes,
      ...newestFirst.filter(
        (drillhole) => !promotedHoleIds.has(drillhole.holeId),
      ),
    ],
    recentCount: recentDrillholes.length,
  };
}
