import { describe, it, expect } from 'vitest';
import { SAMPLE_GARMENTS, sampleToCandidate } from './sampleGarments';
import fs from 'node:fs';
import path from 'node:path';

describe('sample garments', () => {
  it('has unique ids and files', () => {
    expect(new Set(SAMPLE_GARMENTS.map((s) => s.id)).size).toBe(SAMPLE_GARMENTS.length);
    expect(new Set(SAMPLE_GARMENTS.map((s) => s.file)).size).toBe(SAMPLE_GARMENTS.length);
  });

  it('every listed file exists in public/ and is a PNG', () => {
    for (const s of SAMPLE_GARMENTS) {
      const p = path.resolve('apps/web/public', s.file);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p).subarray(1, 4).toString()).toBe('PNG');
    }
  });

  it('builds a top candidate with a correct URL for any base', () => {
    const s = SAMPLE_GARMENTS[0];
    expect(sampleToCandidate(s, '/').url).toBe('/samples/tee-red-stripes.png');
    expect(sampleToCandidate(s, '/app').url).toBe('/app/samples/tee-red-stripes.png');
    expect(sampleToCandidate(s, '/').garmentType).toBe('top');
  });
});
