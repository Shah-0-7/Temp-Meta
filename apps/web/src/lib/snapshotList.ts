/**
 * @module lib/snapshotList
 *
 * Pure list logic for the in-memory snapshot gallery (no DOM, no store), so it
 * can be unit-tested. Snapshots are never persisted: they live only in memory
 * for the session, because they contain the user's face.
 */

export const MAX_SNAPSHOTS = 12;
export const MAX_COMPARE = 2;

export interface HasId {
  id: string;
}

/** Newest first. Returns the new list and whatever fell off the end (to release). */
export function addSnapshot<T extends HasId>(
  list: readonly T[],
  item: T,
  max = MAX_SNAPSHOTS,
): { list: T[]; evicted: T[] } {
  const next = [item, ...list.filter((s) => s.id !== item.id)];
  return { list: next.slice(0, max), evicted: next.slice(max) };
}

export function removeSnapshot<T extends HasId>(
  list: readonly T[],
  id: string,
): { list: T[]; removed: T | null } {
  const removed = list.find((s) => s.id === id) ?? null;
  return { list: list.filter((s) => s.id !== id), removed };
}

/**
 * Toggle an id in the compare selection. At most `max` are kept; picking a new
 * one when full drops the oldest pick (so the user never gets stuck).
 */
export function toggleCompare(selected: readonly string[], id: string, max = MAX_COMPARE): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  const next = [...selected, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Drop selection ids that no longer exist in the list. */
export function pruneSelection(selected: readonly string[], list: readonly HasId[]): string[] {
  const ids = new Set(list.map((s) => s.id));
  return selected.filter((id) => ids.has(id));
}
