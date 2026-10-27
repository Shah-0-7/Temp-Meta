import { describe, it, expect } from 'vitest';
import {
  autoSegment, estimateBackground, floodFillForeground, magicWand, segmentBox,
  filterComponents, softenMask, buildCutout, maskBounds, maskCoverage,
} from '../../src/garment/cutout.js';
import { prepareFromRgba } from '../../src/garment/prepareGarment.js';
import { analyzeGarment } from '../../src/garment/anchors.js';
import { encodeMaskRuns, decodeMaskRuns, resizeAlpha } from '../../src/mask/rle.js';
import { makeTee } from '../helpers.js';

describe('background removal', () => {
  it('estimates a white studio background', () => {
    const bg = estimateBackground(makeTee());
    expect(bg.r).toBeGreaterThan(250);
    expect(bg.coverage).toBeGreaterThan(0.95);
  });

  it('removes the background but keeps the white graphic inside the garment', () => {
    const img = makeTee();
    const fg = floodFillForeground(img, { r: 255, g: 255, b: 255 });
    expect(fg[10 * 400 + 10]).toBe(0);            // corner = background
    expect(fg[100 * 400 + 200]).toBe(1);          // torso
    expect(fg[280 * 400 + 200]).toBe(1);          // white graphic is interior -> kept
    expect(fg[120 * 400 + 80]).toBe(1);           // sleeve
  });

  it('keeps the collar notch as background (connected to the outside)', () => {
    const fg = floodFillForeground(makeTee(), { r: 255, g: 255, b: 255 });
    expect(fg[85 * 400 + 200]).toBe(0);
  });

  it('autoSegment is confident on studio shots and unsure on busy photos', () => {
    expect(autoSegment(makeTee()).confidence).toBeGreaterThan(0.8);
    const busy = makeTee();
    for (let i = 0; i < busy.data.length; i += 4) {
      const v = ((i / 4) * 2654435761) >>> 24; // deterministic noise
      busy.data[i] = v; busy.data[i + 1] = (v * 7) & 255; busy.data[i + 2] = (v * 13) & 255;
    }
    expect(autoSegment(busy).confidence).toBeLessThan(0.5);
  });

  it('respects existing transparency', () => {
    const img = makeTee();
    const fg = floodFillForeground(img, { r: 255, g: 255, b: 255 });
    for (let i = 0; i < fg.length; i++) img.data[i * 4 + 3] = fg[i] ? 255 : 0;
    const r = autoSegment(img);
    expect(r.background).toBeNull();
    expect(maskCoverage(r.mask)).toBeGreaterThan(0.3);
  });
});

describe('selection helpers', () => {
  it('magic wand selects the clicked region only', () => {
    const m = magicWand(makeTee(), 200, 400, 30);
    expect(m[400 * 400 + 200]).toBe(1);
    expect(m[10 * 400 + 10]).toBe(0);
  });

  it('box segmentation stays inside the box', () => {
    const img = makeTee();
    const r = segmentBox(img, { x1: 100, y1: 60, x2: 300, y2: 500 });
    expect(r.mask[100 * 400 + 200]).toBe(1);
    expect(r.mask[120 * 400 + 60]).toBe(0); // sleeve is outside the box
  });

  it('filterComponents drops specks', () => {
    const w = 20, h = 20, m = new Uint8Array(w * h);
    for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) m[y * w + x] = 1;
    m[0] = 1;
    const out = filterComponents(m, w, h, 0.1);
    expect(out[0]).toBe(0);
    expect(out[10 * w + 10]).toBe(1);
  });

  it('softenMask feathers the edge', () => {
    const w = 20, h = 20, m = new Uint8Array(w * h);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 1;
    const a = softenMask(m, w, h);
    expect(a[10 * w + 10]).toBe(255);
    expect(a[0]).toBe(0);
    const edge = a[10 * w + 5];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });
});

describe('cut-out + anchors', () => {
  it('crops tightly with transparent surroundings', () => {
    const p = prepareFromRgba(makeTee());
    expect(p.mode).toBe('flood-fill');
    expect(p.image.width).toBeLessThan(400);
    expect(p.image.height).toBeLessThan(500);
    expect(p.image.data[3]).toBe(0); // corner transparent
    const b = maskBounds(Array.from({ length: p.image.width * p.image.height }, (_, i) => p.image.data[i * 4 + 3]), p.image.width, p.image.height, 128)!;
    expect(b.x1).toBeLessThan(p.image.width * 0.08);
    expect(b.y2).toBeGreaterThan(p.image.height * 0.9);
  });

  it('defringes: no white halo on a red shirt edge', () => {
    const p = prepareFromRgba(makeTee());
    let whitish = 0, edge = 0;
    for (let i = 0; i < p.image.width * p.image.height; i++) {
      const a = p.image.data[i * 4 + 3];
      if (a > 20 && a < 235) { edge++; if (p.image.data[i * 4 + 1] > 150) whitish++; }
    }
    expect(edge).toBeGreaterThan(0);
    expect(whitish / edge).toBeLessThan(0.1);
  });

  it('falls back to the full photo when nothing can be separated', () => {
    const img = makeTee();
    for (let i = 0; i < img.data.length; i += 4) { const v = ((i / 4) * 2654435761) >>> 24; img.data[i] = v; img.data[i + 1] = (v * 7) & 255; img.data[i + 2] = (v * 13) & 255; }
    expect(prepareFromRgba(img).mode).toBe('none');
  });

  it('finds tee anchors: torso edges, shoulders above armpits, sleeves outside the torso', () => {
    const p = prepareFromRgba(makeTee());
    const a = p.anchors;
    expect(a.confidence).toBeGreaterThan(0.5);
    expect(a.shoulderL[0]).toBeLessThan(a.shoulderR[0]);
    expect(a.shoulderL[1]).toBeLessThan(a.armpitL[1]);
    expect(a.armpitL[1]).toBeLessThan(a.hemL[1]);
    expect(a.sleeveEndL).not.toBeNull();
    expect(a.sleeveEndL![0]).toBeLessThan(a.shoulderL[0]);
    expect(a.sleeveEndR![0]).toBeGreaterThan(a.shoulderR[0]);
    // torso is 160 of 320 px wide (sleeves 80 each side) => about half the image width
    expect(a.hemR[0] - a.hemL[0]).toBeGreaterThan(0.4);
    expect(a.hemR[0] - a.hemL[0]).toBeLessThan(0.6);
  });

  it('sleeveless garment has no sleeve anchors', () => {
    const w = 200, h = 300, alpha = new Uint8Array(w * h);
    for (let y = 10; y < 290; y++) for (let x = 40; x < 160; x++) alpha[y * w + x] = 255;
    const a = analyzeGarment(alpha, w, h);
    expect(a.sleeveEndL).toBeNull();
    expect(a.sleeveEndR).toBeNull();
  });

  it('buildCutout rejects mismatched alpha and returns null for empty masks', () => {
    const img = makeTee(40, 40);
    expect(() => buildCutout(img, new Uint8Array(3))).toThrow();
    expect(buildCutout(img, new Uint8Array(40 * 40))).toBeNull();
  });
});

describe('mask run-length codec', () => {
  it('round-trips', () => {
    const m = new Uint8Array([0, 0, 1, 1, 1, 0, 1, 0, 0, 0]);
    expect(Array.from(decodeMaskRuns(encodeMaskRuns(m), m.length))).toEqual(Array.from(m));
    const ones = new Uint8Array([1, 1, 1]);
    expect(encodeMaskRuns(ones)[0]).toBe(0);
    expect(Array.from(decodeMaskRuns(encodeMaskRuns(ones), 3))).toEqual([1, 1, 1]);
  });
  it('rejects corrupt runs', () => {
    expect(() => decodeMaskRuns([5, 5], 4)).toThrow();
    expect(() => decodeMaskRuns([1, 1], 4)).toThrow();
    expect(() => decodeMaskRuns([-1, 5], 4)).toThrow();
  });
  it('resizeAlpha keeps values on identity and interpolates otherwise', () => {
    const src = new Uint8Array([0, 255, 0, 255]);
    expect(Array.from(resizeAlpha(src, 2, 2, 2, 2))).toEqual([0, 255, 0, 255]);
    const up = resizeAlpha(new Uint8Array([0, 255]), 2, 1, 4, 1);
    expect(up[0]).toBe(0);
    expect(up[3]).toBe(255);
    expect(up[1]).toBeGreaterThan(0);
  });
});
