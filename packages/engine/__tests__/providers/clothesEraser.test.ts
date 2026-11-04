import { describe, it, expect } from 'vitest';
import { eraseClothes, dominantColor, skinColor, buildZones } from '../../src/providers/tryon-generator/clothesEraser';
import { hasLongSleeves } from '../../src/providers/tryon-generator/LocalTryOnGenerator';
import { buildOcclusionMask } from '../../src/tracking/occlusion';
import { trimBackgroundHalo, type RgbaImage } from '../../src/garment/cutout';
import { defaultAnchors } from '../../src/garment/anchors';
import type { Landmark, SegmentationMask } from '../../src/tracking/types';
import { PoseIndex, SegmentationClass } from '../../src/tracking/types';

const W = 200;
const H = 280;

function pose(over: Partial<Record<keyof typeof PoseIndex, [number, number]>> = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const set = (k: keyof typeof PoseIndex, x: number, y: number) => { lm[PoseIndex[k]] = { x, y, z: 0, visibility: 0.99 }; };
  set('NOSE', 0.5, 0.15);
  set('LEFT_SHOULDER', 0.65, 0.3); set('RIGHT_SHOULDER', 0.35, 0.3);
  set('LEFT_HIP', 0.6, 0.65); set('RIGHT_HIP', 0.4, 0.65);
  set('LEFT_ELBOW', 0.7, 0.45); set('RIGHT_ELBOW', 0.3, 0.45);
  set('LEFT_WRIST', 0.7, 0.6); set('RIGHT_WRIST', 0.3, 0.6);
  for (const [k, v] of Object.entries(over)) set(k as keyof typeof PoseIndex, v![0], v![1]);
  return lm;
}

/** A person-shaped class map: clothes torso (+ trousers below), bare skin forearms and a face. */
function segmentation(): SegmentationMask {
  const n = 64;
  const data = new Uint8Array(n * n);
  const fill = (x1: number, y1: number, x2: number, y2: number, c: number) => {
    for (let y = Math.floor(y1 * n); y < Math.floor(y2 * n); y++)
      for (let x = Math.floor(x1 * n); x < Math.floor(x2 * n); x++) data[y * n + x] = c;
  };
  fill(0.3, 0.3, 0.7, 0.72, SegmentationClass.Clothes); // shirt incl. a bit of hem
  fill(0.4, 0.72, 0.6, 1, SegmentationClass.Clothes);   // trousers
  fill(0.42, 0.08, 0.58, 0.24, SegmentationClass.FaceSkin);
  fill(0.66, 0.45, 0.74, 0.62, SegmentationClass.BodySkin); // a forearm
  fill(0.0, 0.0, 0.1, 0.1, SegmentationClass.Accessories);
  return { data, width: n, height: n, timestamp: 0 };
}

function frame(rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255; }
  return { data, width: W, height: H };
}
const px = (img: { data: Uint8ClampedArray; width: number }, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

describe('eraseClothes', () => {
  it('recolours the torso to the garment colour and leaves the background and trousers alone', () => {
    const img = frame([120, 90, 70]);
    const out = eraseClothes({
      image: img, segmentation: segmentation(), landmarks: pose(),
      garmentColor: { r: 20, g: 20, b: 20 }, longSleeves: true, hemExtend: 0.12,
    });
    expect(out).not.toBeNull();
    const mid = px(out!.image, Math.round(W * 0.5), Math.round(H * 0.45));
    expect(mid[0]).toBeLessThan(60); // now close to the dark garment colour
    // Background (top-left corner) and trousers (well below the hem) are untouched.
    expect(px(out!.image, 3, 3)).toEqual([120, 90, 70]);
    expect(px(out!.image, Math.round(W * 0.5), Math.round(H * 0.92))).toEqual([120, 90, 70]);
    expect(out!.coverage).toBeGreaterThan(0.05);
  });

  it('does not mutate the input pixels', () => {
    const img = frame([120, 90, 70]);
    const before = Array.from(img.data.slice(0, 64));
    eraseClothes({ image: img, segmentation: segmentation(), landmarks: pose(), garmentColor: { r: 0, g: 0, b: 0 }, longSleeves: false });
    expect(Array.from(img.data.slice(0, 64))).toEqual(before);
  });

  it('returns null when the shoulders are not found', () => {
    const lm = pose();
    lm[PoseIndex.LEFT_SHOULDER].visibility = 0.05;
    expect(eraseClothes({ image: frame([1, 2, 3]), segmentation: segmentation(), landmarks: lm, garmentColor: { r: 0, g: 0, b: 0 }, longSleeves: false })).toBeNull();
  });

  it('returns null when no clothes are in the body zone', () => {
    const seg = segmentation();
    seg.data.fill(SegmentationClass.Background);
    expect(eraseClothes({ image: frame([1, 2, 3]), segmentation: seg, landmarks: pose(), garmentColor: { r: 0, g: 0, b: 0 }, longSleeves: false })).toBeNull();
  });

  it('keeps a pattern out: a checker of old fabric becomes smooth', () => {
    const img = frame([100, 100, 100]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 60 : 160;
      const i = (y * W + x) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    }
    const out = eraseClothes({ image: img, segmentation: segmentation(), landmarks: pose(), garmentColor: { r: 90, g: 90, b: 90 }, longSleeves: true })!;
    const a = px(out.image, 100, 125)[0];
    const b = px(out.image, 104, 125)[0];
    expect(Math.abs(a - b)).toBeLessThan(10); // the 100-level checker contrast is gone
  });
});

describe('colours and zones', () => {
  it('dominantColor ignores transparent pixels and a minority logo', () => {
    const data = new Uint8ClampedArray(40 * 40 * 4);
    for (let i = 0; i < 1600; i++) { data[i * 4] = 200; data[i * 4 + 1] = 30; data[i * 4 + 2] = 30; data[i * 4 + 3] = i < 100 ? 0 : 255; }
    for (let i = 800; i < 900; i++) { data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; }
    expect(dominantColor(data, 40, 40)).toEqual({ r: 200, g: 30, b: 30 });
  });

  it('dominantColor is null for an empty cut-out', () => {
    expect(dominantColor(new Uint8ClampedArray(40 * 40 * 4), 40, 40)).toBeNull();
  });

  it('skinColor reads body skin first', () => {
    const img = frame([0, 0, 0]);
    const seg = segmentation();
    // Paint the forearm area of the frame a known tone.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x > W * 0.66 && x < W * 0.74 && y > H * 0.45 && y < H * 0.62) { const i = (y * W + x) * 4; img.data[i] = 180; img.data[i + 1] = 120; img.data[i + 2] = 90; }
    }
    expect(skinColor(img, seg)).toEqual({ r: 180, g: 120, b: 90 });
  });

  it('buildZones needs both shoulders and extrapolates missing hips', () => {
    const lm = pose();
    lm[PoseIndex.LEFT_HIP].visibility = 0; lm[PoseIndex.RIGHT_HIP].visibility = 0;
    const z = buildZones(lm, W / H);
    expect(z).not.toBeNull();
    expect(z!.torso[2].y).toBeGreaterThan(z!.torso[0].y);
    lm[PoseIndex.RIGHT_SHOULDER].visibility = 0;
    expect(buildZones(lm, W / H)).toBeNull();
  });

  it('hasLongSleeves tells a tee from a long-sleeve top', () => {
    expect(hasLongSleeves(defaultAnchors())).toBe(false);
    const a = defaultAnchors();
    a.sleeveEndL = [0.05, 0.8];
    a.sleeveEndR = [0.95, 0.8];
    expect(hasLongSleeves(a)).toBe(true);
    a.sleeveEndL = null; a.sleeveEndR = null;
    expect(hasLongSleeves(a)).toBe(false);
  });
});

describe('forearm in front of the torso', () => {
  function seg256(): SegmentationMask {
    const n = 256;
    const data = new Uint8Array(n * n);
    // Bare forearm lying across the chest from the elbow (0.62, 0.5) to the wrist (0.42, 0.5).
    for (let y = Math.floor(0.47 * n); y < Math.floor(0.53 * n); y++)
      for (let x = Math.floor(0.4 * n); x < Math.floor(0.64 * n); x++) data[y * n + x] = SegmentationClass.BodySkin;
    return { data, width: n, height: n, timestamp: 0 };
  }
  it('keeps the whole forearm when the wrist is over the torso', () => {
    const lm = pose({ LEFT_ELBOW: [0.62, 0.5], LEFT_WRIST: [0.42, 0.5] });
    const m = buildOcclusionMask(seg256(), lm, { aspect: W / H });
    // A point near the elbow end of the forearm, far from the hand.
    expect(m.data[Math.floor(0.5 * 256) * 256 + Math.floor(0.6 * 256)]).toBe(255);
  });
});

describe('trimBackgroundHalo', () => {
  function scene(): { img: RgbaImage; mask: Uint8Array } {
    const w = 120, h = 120;
    const data = new Uint8ClampedArray(w * h * 4);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const inHalo = x >= 20 && x < 100 && y >= 20 && y < 100;
      const inCore = x >= 26 && x < 94 && y >= 26 && y < 94;
      if (inHalo) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 215; mask[i] = 1; }
      if (inCore) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 25; }
    }
    return { img: { data, width: w, height: h }, mask };
  }
  it('removes a light halo around a dark garment', () => {
    const { img, mask } = scene();
    const out = trimBackgroundHalo(img, mask, { r: 255, g: 255, b: 255 }, { band: 8 });
    expect(out[60 * 120 + 22]).toBe(0); // halo pixel gone
    expect(out[60 * 120 + 60]).toBe(1); // garment stays
    expect(out[60 * 120 + 30]).toBe(1);
  });
  it('does nothing when the garment is as light as the background', () => {
    const { img, mask } = scene();
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 235; }
    const out = trimBackgroundHalo(img, mask, { r: 255, g: 255, b: 255 }, { band: 8 });
    expect(out[60 * 120 + 22]).toBe(1);
  });
});
