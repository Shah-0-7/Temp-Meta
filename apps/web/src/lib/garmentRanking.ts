/**
 * @module lib/garmentRanking
 *
 * Joins the server's image candidates with the engine's ranking, so the best photo of the
 * garment is chosen automatically and carries a garment kind.
 */

import { detectGarmentType, type GarmentCandidate, type ImageCandidate } from '@tryanywhere/engine';
import type { GarmentCandidateWithProxy } from '../stores/garmentStore';

/** What /api/resolve returns for each image. */
export interface ServerCandidate extends ImageCandidate {
  proxyUrl?: string;
}

/** Heuristic scores run to roughly 140; the badge wants 0..1. */
const normalize = (score: number) => Math.max(0, Math.min(1, score / 100));

/**
 * Orders candidates best first and attaches score and kind.
 * The page title describes the product, so when it names a kind of garment it decides the kind
 * for every image on the page. Otherwise each image's own alt text or file name decides.
 */
export function mergeRanked(
  raw: readonly ServerCandidate[],
  ranked: readonly GarmentCandidate[],
  pageTitle?: string | null,
): GarmentCandidateWithProxy[] {
  const byUrl = new Map(raw.map((c) => [c.url, c]));
  const fromTitle = pageTitle ? detectGarmentType(pageTitle) : null;

  const out: GarmentCandidateWithProxy[] = [];
  const used = new Set<string>();
  for (const r of ranked) {
    const original = byUrl.get(r.url);
    if (!original || used.has(r.url)) continue;
    used.add(r.url);
    out.push({
      ...r,
      score: normalize(r.score),
      garmentType: fromTitle?.matched ? fromTitle.type : r.garmentType,
      proxyUrl: original.proxyUrl,
      alt: original.alt,
      width: original.width,
      height: original.height,
    });
  }
  // Anything the ranker dropped keeps its place at the end rather than disappearing.
  for (const c of raw) {
    if (used.has(c.url)) continue;
    out.push({
      url: c.url,
      score: 0,
      garmentType: fromTitle?.matched ? fromTitle.type : 'top',
      attributes: {},
      proxyUrl: c.proxyUrl,
      alt: c.alt,
      width: c.width,
      height: c.height,
    });
  }
  return out;
}
