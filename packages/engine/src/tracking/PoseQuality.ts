/**
 * @module tracking/PoseQuality
 *
 * Turns raw pose landmarks into actionable guidance ("move back", "face the
 * camera"...) so users understand WHY a garment does not fit well instead of
 * seeing a broken overlay. Pure functions, no DOM.
 */

import type { Landmark, PoseStatus, PoseStatusCode } from './types.js';
import { PoseIndex } from './types.js';

export interface EvaluatePoseOptions {
  /** videoWidth / videoHeight. Needed so distances are isotropic. Default 16/9. */
  aspect?: number;
  /** Minimum visibility for a shoulder to count as seen. Default 0.5. */
  minShoulderVisibility?: number;
  /** Minimum visibility for a hip to count as seen. Default 0.4. */
  minHipVisibility?: number;
}

const MESSAGES: Record<PoseStatusCode, string> = {
  ok: '',
  'no-person': 'Step into view so I can see your shoulders.',
  'show-shoulders': 'Make sure both shoulders are inside the frame.',
  'show-hips': 'Step back a little so your hips are visible.',
  'move-back': 'You are very close. Step back a little.',
  'move-closer': 'Move a bit closer to the camera.',
  'face-camera': 'Turn to face the camera.',
};

const MARGIN = 0.015; // landmarks closer than this to the frame edge count as clipped

function status(
  code: PoseStatusCode,
  shoulderWidth: number,
  confidence: number,
): PoseStatus {
  return {
    code,
    message: MESSAGES[code],
    // Missing hips are tolerated: the garment mapper extrapolates them.
    ok: code === 'ok' || code === 'show-hips',
    shoulderWidth,
    confidence,
  };
}

/** True when a landmark is confidently seen AND not clipped by the frame edge. */
function seen(l: Landmark, minVisibility: number): boolean {
  return (
    l.visibility >= minVisibility &&
    l.x > MARGIN &&
    l.x < 1 - MARGIN &&
    l.y > MARGIN &&
    l.y < 1 - MARGIN
  );
}

/** Evaluate a single pose. `null` means no person was detected. */
export function evaluatePose(
  landmarks: readonly Landmark[] | null,
  options: EvaluatePoseOptions = {},
): PoseStatus {
  const aspect = options.aspect ?? 16 / 9;
  const minShoulder = options.minShoulderVisibility ?? 0.5;
  const minHip = options.minHipVisibility ?? 0.4;

  if (!landmarks || landmarks.length < 25) return status('no-person', 0, 0);

  const ls = landmarks[PoseIndex.LEFT_SHOULDER];
  const rs = landmarks[PoseIndex.RIGHT_SHOULDER];
  const lh = landmarks[PoseIndex.LEFT_HIP];
  const rh = landmarks[PoseIndex.RIGHT_HIP];

  const confidence = (ls.visibility + rs.visibility + lh.visibility + rh.visibility) / 4;

  // Shoulder width in "frame heights" (isotropic units).
  const shoulderWidth = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);

  if (!seen(ls, minShoulder) || !seen(rs, minShoulder)) {
    return status('show-shoulders', shoulderWidth, confidence);
  }

  const hipsSeen = seen(lh, minHip) && seen(rh, minHip);

  // Facing check first: a turned torso has narrow shoulders, which must not be
  // mistaken for "too far away". A frontal torso is about as wide (shoulders) as
  // it is tall (shoulder-to-hip); turned, the visible width collapses.
  if (hipsSeen) {
    const midSx = (ls.x + rs.x) / 2;
    const midSy = (ls.y + rs.y) / 2;
    const midHx = (lh.x + rh.x) / 2;
    const midHy = (lh.y + rh.y) / 2;
    const torsoLen = Math.hypot((midSx - midHx) * aspect, midSy - midHy);
    if (torsoLen > 0.05 && shoulderWidth / torsoLen < 0.45) {
      return status('face-camera', shoulderWidth, confidence);
    }
  }

  if (shoulderWidth > 0.62) return status('move-back', shoulderWidth, confidence);
  if (shoulderWidth < 0.1) return status('move-closer', shoulderWidth, confidence);

  if (hipsSeen) return status('ok', shoulderWidth, confidence);

  // Shoulders fine, hips missing.
  return status('show-hips', shoulderWidth, confidence);
}

/**
 * Debounces status changes so the UI hint does not flicker.
 * - A "bad" status must persist for `badFrames` before being reported.
 * - Recovering to "ok" is reported after `goodFrames`.
 */
export class PoseStatusTracker {
  private _reported: PoseStatus;
  private _candidate: PoseStatusCode | null = null;
  private _candidateCount = 0;

  constructor(
    private readonly _badFrames = 6,
    private readonly _goodFrames = 3,
  ) {
    this._reported = status('no-person', 0, 0);
  }

  get current(): PoseStatus {
    return this._reported;
  }

  /** Feed the newest evaluation; returns the debounced status to show. */
  update(next: PoseStatus): PoseStatus {
    if (next.code === this._reported.code) {
      this._candidate = null;
      this._candidateCount = 0;
      // Keep numbers fresh while the code is stable.
      this._reported = next;
      return this._reported;
    }

    if (this._candidate === next.code) {
      this._candidateCount++;
    } else {
      this._candidate = next.code;
      this._candidateCount = 1;
    }

    const needed = next.code === 'ok' ? this._goodFrames : this._badFrames;
    if (this._candidateCount >= needed) {
      this._reported = next;
      this._candidate = null;
      this._candidateCount = 0;
    }
    return this._reported;
  }

  reset(): void {
    this._reported = status('no-person', 0, 0);
    this._candidate = null;
    this._candidateCount = 0;
  }
}
