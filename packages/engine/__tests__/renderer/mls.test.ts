import { describe, it, expect } from 'vitest';
import { mlsSimilarity, fitSimilarity, type MlsPoint } from '../../src/renderer/mls.js';

const pt = (px: number, py: number, qx: number, qy: number, w = 1): MlsPoint => ({ px, py, qx, qy, w });

describe('mlsSimilarity', () => {
  it('interpolates control points exactly', () => {
    const pts = [pt(0, 0, 10, 10), pt(1, 0, 12, 11), pt(0, 1, 9, 13), pt(1, 1, 14, 15)];
    for (const p of pts) {
      const [x, y] = mlsSimilarity(pts, p.px, p.py);
      expect(x).toBeCloseTo(p.qx, 6);
      expect(y).toBeCloseTo(p.qy, 6);
    }
  });

  it('is the identity for identity control points', () => {
    const pts = [pt(0, 0, 0, 0), pt(1, 0, 1, 0), pt(0, 1, 0, 1)];
    const [x, y] = mlsSimilarity(pts, 0.4, 0.7);
    expect(x).toBeCloseTo(0.4, 6);
    expect(y).toBeCloseTo(0.7, 6);
  });

  it('reproduces a pure rotation + scale + translation everywhere', () => {
    const s = 2, th = Math.PI / 6, tx = 3, ty = -1;
    const f = (x: number, y: number): [number, number] => [
      s * (Math.cos(th) * x - Math.sin(th) * y) + tx,
      s * (Math.sin(th) * x + Math.cos(th) * y) + ty,
    ];
    const src: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const pts = src.map(([x, y]) => { const [qx, qy] = f(x, y); return pt(x, y, qx, qy); });
    for (const [x, y] of [[0.5, 0.5], [2, -1], [0.2, 0.9]] as Array<[number, number]>) {
      const [ex, ey] = f(x, y);
      const [ax, ay] = mlsSimilarity(pts, x, y);
      expect(ax).toBeCloseTo(ex, 5);
      expect(ay).toBeCloseTo(ey, 5);
    }
  });

  it('does not shear: a rotated frame keeps right angles', () => {
    const th = 0.4;
    const rot = (x: number, y: number): [number, number] => [Math.cos(th) * x - Math.sin(th) * y, Math.sin(th) * x + Math.cos(th) * y];
    const pts = ([[0, 0], [1, 0], [0, 1]] as Array<[number, number]>).map(([x, y]) => { const [qx, qy] = rot(x, y); return pt(x, y, qx, qy); });
    const a = mlsSimilarity(pts, 0.5, 0.5);
    const b = mlsSimilarity(pts, 1.5, 0.5);
    const c = mlsSimilarity(pts, 0.5, 1.5);
    const dot = (b[0] - a[0]) * (c[0] - a[0]) + (b[1] - a[1]) * (c[1] - a[1]);
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });

  it('handles a single control point as translation and none as identity', () => {
    const [x, y] = mlsSimilarity([pt(0.2, 0.2, 0.5, 0.6)], 0.3, 0.3);
    expect(x).toBeCloseTo(0.6, 9);
    expect(y).toBeCloseTo(0.7, 9);
    expect(mlsSimilarity([], 0.3, 0.4)).toEqual([0.3, 0.4]);
  });

  it('a low-weight point pulls less than a high-weight one', () => {
    const base = [pt(0, 0, 0, 0), pt(1, 0, 1, 0), pt(0, 1, 0, 1)];
    const strong = mlsSimilarity([...base, pt(1, 1, 1, 3, 1)], 0.9, 0.9)[1];
    const weak = mlsSimilarity([...base, pt(1, 1, 1, 3, 0.05)], 0.9, 0.9)[1];
    expect(Math.abs(strong - 0.9)).toBeGreaterThan(Math.abs(weak - 0.9));
  });

  it('fitSimilarity recovers the transform', () => {
    const s = 1.5, th = 0.3;
    const pts = ([[0, 0], [2, 0], [0, 1]] as Array<[number, number]>).map(([x, y]) =>
      pt(x, y, s * (Math.cos(th) * x - Math.sin(th) * y) + 4, s * (Math.sin(th) * x + Math.cos(th) * y) + 2));
    const fit = fitSimilarity(pts)!;
    expect(fit.scale).toBeCloseTo(s, 6);
    expect(fit.rotation).toBeCloseTo(th, 6);
    expect(fit.tx).toBeCloseTo(4, 6);
    expect(fit.ty).toBeCloseTo(2, 6);
  });
});
