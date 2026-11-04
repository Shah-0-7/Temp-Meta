import { describe, it, expect } from 'vitest';
import { imageSize, sizeStringLike } from '../../src/services/imageSize';

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

function jpeg(w: number, h: number): Uint8Array {
  // SOI, an APP0 segment to skip, then SOF0 with the size.
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof]);
}

function webpX(w: number, h: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  const w1 = w - 1, h1 = h - 1;
  b.set([w1 & 255, (w1 >> 8) & 255, (w1 >> 16) & 255], 24);
  b.set([h1 & 255, (h1 >> 8) & 255, (h1 >> 16) & 255], 27);
  return b;
}

function webpL(w: number, h: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
  b[20] = 0x2f;
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  b.set([bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255], 21);
  return b;
}

describe('imageSize', () => {
  it('reads PNG', () => expect(imageSize(png(1280, 720))).toEqual({ width: 1280, height: 720 }));
  it('reads JPEG past other segments', () => expect(imageSize(jpeg(1920, 1080))).toEqual({ width: 1920, height: 1080 }));
  it('reads WebP extended', () => expect(imageSize(webpX(800, 1200))).toEqual({ width: 800, height: 1200 }));
  it('reads WebP lossless', () => expect(imageSize(webpL(640, 480))).toEqual({ width: 640, height: 480 }));
  it('returns null for junk, truncated data and zero sizes', () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(imageSize(png(0, 10))).toBeNull();
  });
});

describe('sizeStringLike', () => {
  it('keeps the aspect ratio at the requested long side', () => {
    expect(sizeStringLike({ width: 1280, height: 720 }, 1536)).toBe('1536x864');
    expect(sizeStringLike({ width: 720, height: 1280 }, 1536)).toBe('864x1536');
  });
  it('is null when the size is unknown', () => expect(sizeStringLike(null, 1536)).toBeNull());
});
