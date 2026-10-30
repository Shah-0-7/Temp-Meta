/**
 * @module lib/garmentList
 *
 * Pure helpers behind the garment store: which blob: URLs are still in use (so the rest can be
 * revoked instead of pinning uploaded files in memory), and the session's recently used list.
 */

/** The fields of a garment these helpers look at. */
export interface GarmentRef {
  url: string;
  proxyUrl?: string;
}

/** How many recently used garments are remembered for this session. */
export const MAX_RECENTS = 6;

export const isBlobUrl = (url?: string | null): url is string => !!url && url.startsWith('blob:');

/** Every blob: URL still referenced by the candidate list, the selection or the recents. */
export function blobUrlsInUse(s: {
  candidates: readonly GarmentRef[];
  selectedGarment: GarmentRef | null;
  recents: readonly GarmentRef[];
}): Set<string> {
  const urls = new Set<string>();
  for (const c of [...s.candidates, ...(s.selectedGarment ? [s.selectedGarment] : []), ...s.recents]) {
    if (isBlobUrl(c.url)) urls.add(c.url);
    if (isBlobUrl(c.proxyUrl)) urls.add(c.proxyUrl);
  }
  return urls;
}

/** Newest first, no duplicates (by url), capped at MAX_RECENTS. */
export function pushRecent<T extends GarmentRef>(recents: readonly T[], candidate: T): T[] {
  return [candidate, ...recents.filter((r) => r.url !== candidate.url)].slice(0, MAX_RECENTS);
}
