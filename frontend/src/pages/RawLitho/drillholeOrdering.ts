import type { Drillhole } from "../../types/domain";
/*
 * Drillhole selector ordering — the only place that decides the order.
 *
 * The list is built as:
 *   1. the 3 most recently selected drillholes, most recent first,
 *   2. then every remaining drillhole, newest first.
 *
 * A recently selected hole is never listed twice: it is removed from the
 * newest-first part.
 *
 * NEWEST FIRST: `/api/drillholes` (and the IndexedDB cache that mirrors it)
 * hands the records over oldest first, so newest first is that order reversed.
 * The records carry no date field, so this is the only signal available. If the
 * API ever returns a date, `sortDrillholesByNewestFirst` is the single function
 * to change.
 */

export const RECENT_DRILLHOLE_LIMIT = 3;

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

export function sortDrillholesByNewestFirst(drillholes: readonly Drillhole[]) {
  return [...drillholes].reverse();
}

export function orderDrillholes(
  drillholes: readonly Drillhole[],
  recentHoleIds: readonly string[],
) {
  const newestFirst = sortDrillholesByNewestFirst(drillholes);
  const recentHoleIdList = normalizeRecentHoleIds(recentHoleIds);

  if (recentHoleIdList.length === 0) return newestFirst;

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

  return [
    ...recentDrillholes,
    ...newestFirst.filter(
      (drillhole) => !promotedHoleIds.has(drillhole.holeId),
    ),
  ];
}
