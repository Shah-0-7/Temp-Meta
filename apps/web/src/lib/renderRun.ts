/**
 * @module lib/renderRun
 *
 * "Latest render wins." A realistic render can take a minute. If the person starts another,
 * or closes the panel, the older one must not later reopen the panel, replace the newer
 * result, or drop a stale entry into the gallery. Each render takes a ticket; only the
 * holder of the newest ticket may publish.
 */

let current = 0;

/** Starts a render and invalidates every earlier one. */
export function startRender(): number {
  return ++current;
}

/** True while `ticket` is still the newest render. */
export function isCurrentRender(ticket: number): boolean {
  return ticket === current;
}

/** Invalidates any render in flight (used when the person closes the panel). */
export function cancelRenders(): void {
  current++;
}
