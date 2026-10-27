import { describe, it, expect } from 'vitest';
import { deriveControlPoints, pointAlongPath } from '../../src/tracking/GarmentKeypoints.js';
import { buildOcclusionMask } from '../../src/tracking/occlusion.js';
import { SegmentationClass } from '../../src/tracking/types.js';
import { prepareFromRgba } from '../../src/garment/prepareGarment.js';
import { mlsSimilarity } from '../../src/renderer/mls.js';
import { makePose, makeTee } from '../helpers.js';

const A = 16 / 9;
const anchors = prepareFromRgba(makeTee()).anchors;
const key = (cps: ReturnType<typeof deriveControlPoints>, k: string) => cps.find((c) => c.key === k);

describe('deriveControlPoints (tops)', () => {
  const lm = makePose();
  const cps = deriveControlPoints(lm, 'top', { mirror: true, aspect: A, anchors, garmentAspect: 0.9 });

  it('produces torso, neck and sleeve pins', () => {
    for (const k of ['shoulderL', 'shoulderR', 'neck', 'armpitL', 'armpitR', 'hemL', 'hemR', 'sleeveL', 'sleeveR']) {
      expect(key(cps, k)).toBeDefined();
    }
  });

  it('screen-left garment pins land on screen-left when mirrored (no flipped garment)', () => {
    expect(key(cps, 'shoulderL')!.dstU).toBeLessThan(key(cps, 'shoulderR')!.dstU);
    expect(key(cps, 'hemL')!.dstU).toBeLessThan(key(cps, 'hemR')!.dstU);
    expect(key(cps, 'sleeveL')!.dstU).toBeLessThan(key(cps, 'shoulderL')!.dstU);
  });

  it('is also unflipped when NOT mirrored', () => {
    const nm = deriveControlPoints(lm, 'top', { mirror: false, aspect: A, anchors, garmentAspect: 0.9 });
    expect(key(nm, 'shoulderL')!.dstU).toBeLessThan(key(nm, 'shoulderR')!.dstU);
    // person's left shoulder is at raw x=0.57; screen-left in a non-mirrored view is the person's RIGHT (0.43)
    expect(key(nm, 'shoulderL')!.dstU).toBeLessThan(0.43);
  });

  it('hem sits below the hips and is as wide as the shirt, not the pelvis', () => {
    const hemY = key(cps, 'hemL')!.dstV;
    expect(hemY).toBeGreaterThan(0.62);
    const hemW = (key(cps, 'hemR')!.dstU - key(cps, 'hemL')!.dstU) * A;
    const hipW = (0.54 - 0.46) * A;
    expect(hemW).toBeGreaterThan(hipW * 1.5);
  });

  it('sleeves end along the arm, not floating off it', () => {
    const s = key(cps, 'sleeveL')!;
    // arm on screen-left goes from shoulder (~0.57 mirrored -> 0.43) down-outward to elbow (0.4 mirrored -> 0.6?)
    expect(s.dstV).toBeGreaterThan(key(cps, 'shoulderL')!.dstV);
    expect(s.dstV).toBeLessThan(0.75);
  });

  it('extrapolates hips when they are out of frame', () => {
    const low = makePose({ LEFT_HIP: { visibility: 0.05 }, RIGHT_HIP: { visibility: 0.05 } });
    const c = deriveControlPoints(low, 'top', { mirror: true, aspect: A, anchors, garmentAspect: 0.9 });
    const hem = key(c, 'hemL')!;
    expect(hem.dstV).toBeGreaterThan(0.45);
    expect(hem.weight).toBeLessThan(0.6);
  });

  it('returns nothing when shoulders are not visible', () => {
    expect(deriveControlPoints(makePose({ LEFT_SHOULDER: { visibility: 0.1 } }), 'top', { mirror: true })).toEqual([]);
  });

  it('drives the mesh so the shirt shoulders land on the body shoulders (end to end)', () => {
    const pts = cps.map((c) => ({ px: c.srcU * 0.9, py: c.srcV, qx: c.dstU * A, qy: c.dstV, w: c.weight }));
    const sh = key(cps, 'shoulderL')!;
    const [x, y] = mlsSimilarity(pts, sh.srcU * 0.9, sh.srcV);
    expect(x / A).toBeCloseTo(sh.dstU, 6);
    expect(y).toBeCloseTo(sh.dstV, 6);
  });
});

describe('pointAlongPath', () => {
  it('walks segments and extends past the end', () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(pointAlongPath(path, 0.5)).toEqual({ x: 0.5, y: 0 });
    const p = pointAlongPath(path, 1.5);
    expect(p.x).toBeCloseTo(1, 9); expect(p.y).toBeCloseTo(0.5, 9);
    const far = pointAlongPath(path, 3);
    expect(far.y).toBeCloseTo(2, 9);
  });
});

describe('buildOcclusionMask', () => {
  const W = 64, H = 64;
  const seg = () => {
    const data = new Uint8Array(W * H);
    // face at top centre, body-skin blob near the left wrist, body-skin bare arm up at the shoulder
    for (let y = 4; y < 14; y++) for (let x = 28; x < 36; x++) data[y * W + x] = SegmentationClass.FaceSkin;
    for (let y = 40; y < 48; y++) for (let x = 8; x < 16; x++) data[y * W + x] = SegmentationClass.BodySkin; // hand
    for (let y = 18; y < 26; y++) for (let x = 8; x < 16; x++) data[y * W + x] = SegmentationClass.BodySkin; // upper arm
    for (let y = 20; y < 30; y++) for (let x = 24; x < 40; x++) data[y * W + x] = SegmentationClass.Hair;
    return { data, width: W, height: H, timestamp: 0 };
  };
  // Landmarks matching the blobs above (raw coords): wrist at (12/64, 44/64), elbow higher up.
  const lm = makePose({
    LEFT_WRIST: { x: 12 / 64, y: 44 / 64 }, LEFT_INDEX: { x: 12 / 64, y: 47 / 64 },
    LEFT_PINKY: { x: 11 / 64, y: 46 / 64 }, LEFT_THUMB: { x: 13 / 64, y: 46 / 64 },
    LEFT_ELBOW: { x: 12 / 64, y: 30 / 64 },
  });

  it('keeps face, hair and the hand in front, but not a bare upper arm', () => {
    const m = buildOcclusionMask(seg(), lm, { aspect: 1 });
    expect(m.data[8 * W + 32]).toBe(255);      // face
    expect(m.data[22 * W + 30]).toBe(255);     // hair
    expect(m.data[44 * W + 12]).toBe(255);     // hand
    expect(m.data[22 * W + 12]).toBe(0);       // upper arm (sleeve should cover it)
    expect(m.data[60 * W + 60]).toBe(0);       // background
  });

  it('without landmarks only face and hair occlude', () => {
    const m = buildOcclusionMask(seg(), null, { aspect: 1 });
    expect(m.data[8 * W + 32]).toBe(255);
    expect(m.data[44 * W + 12]).toBe(0);
  });

  it('reuses the output buffer when sizes match', () => {
    const first = buildOcclusionMask(seg(), lm, { aspect: 1 });
    const second = buildOcclusionMask(seg(), lm, { aspect: 1, out: first });
    expect(second).toBe(first);
  });
});
