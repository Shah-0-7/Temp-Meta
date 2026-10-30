import { describe, it, expect } from 'vitest';
import { blobUrlsInUse, pushRecent, MAX_RECENTS } from './garmentList';

const g = (url: string, proxyUrl?: string) => ({ url, proxyUrl });

describe('blobUrlsInUse', () => {
  it('collects blob urls from candidates, selection and recents, ignoring web urls', () => {
    const used = blobUrlsInUse({
      candidates: [g('blob:a'), g('https://x/y.jpg', 'https://api/proxy?x')],
      selectedGarment: g('blob:b', 'blob:b'),
      recents: [g('blob:c')],
    });
    expect([...used].sort()).toEqual(['blob:a', 'blob:b', 'blob:c']);
  });

  it('is empty when nothing is a blob', () => {
    expect(blobUrlsInUse({ candidates: [g('/a.png')], selectedGarment: null, recents: [] }).size).toBe(0);
  });
});

describe('pushRecent', () => {
  it('puts the newest first and moves a repeat to the front', () => {
    let r = pushRecent([], g('a'));
    r = pushRecent(r, g('b'));
    r = pushRecent(r, g('a'));
    expect(r.map((x) => x.url)).toEqual(['a', 'b']);
  });

  it('caps the list', () => {
    let r: Array<{ url: string }> = [];
    for (let i = 0; i < MAX_RECENTS + 4; i++) r = pushRecent(r, g(`u${i}`));
    expect(r).toHaveLength(MAX_RECENTS);
    expect(r[0].url).toBe(`u${MAX_RECENTS + 3}`);
  });
});
