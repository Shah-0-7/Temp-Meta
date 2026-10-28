/**
 * @module lib/shortcuts
 *
 * Single source of truth for keyboard shortcuts: App binds them, the help
 * dialog and the footer list them. Keys are matched on `event.key.toLowerCase()`.
 */

export interface Shortcut {
  /** Lower-case `event.key` value. */
  key: string;
  /** What is shown on the keycap. */
  label: string;
  description: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { key: ' ', label: 'Space', description: 'Realistic render of this moment' },
  { key: 'g', label: 'G', description: 'Choose a garment' },
  { key: 'l', label: 'L', description: 'Live AI try-on (only when enabled on the server)' },
  { key: 'v', label: 'V', description: 'Open the snapshot gallery' },
  { key: 'm', label: 'M', description: 'Mirror the preview' },
  { key: 'p', label: 'P', description: 'Performance HUD' },
  { key: 'd', label: 'D', description: 'Tracking debug overlay' },
  { key: '?', label: '?', description: 'Help and shortcuts' },
  { key: 'escape', label: 'Esc', description: 'Close the open panel' },
];

export function findShortcut(key: string): Shortcut | undefined {
  const k = key.toLowerCase();
  return SHORTCUTS.find((s) => s.key === k);
}
