import { describe, it, expect } from 'vitest';
import { describeRemote } from './remoteConsent';

const text = (d: ReturnType<typeof describeRemote>) => [d.title, ...d.sends, ...d.notes].join(' ');

describe('describeRemote', () => {
  it('names Meta and does not call it a community service', () => {
    const d = describeRemote('Meta Muse Image', ['meta']);
    expect(d.provider).toBe('Meta Muse Image');
    expect(d.title).toContain('Meta');
    expect(text(d)).toContain('Model API');
    expect(text(d)).not.toMatch(/community/i);
  });

  it('describes only the free community model when that is all there is', () => {
    const d = describeRemote('Leffa (free Hugging Face Space)', ['free-community']);
    expect(text(d)).toMatch(/community-hosted/);
    expect(text(d)).not.toContain('Meta');
  });

  it('tells the person about the second service when Meta can fall back to a community model', () => {
    const d = describeRemote('Meta Muse Image, then Leffa (free Hugging Face Space)', ['meta', 'free-community']);
    expect(text(d)).toContain('Model API');
    expect(text(d)).toMatch(/may try a free, community-hosted model/);
  });

  it('always says the photo is sent, that Cancel keeps it on the device, and that there is a local fallback', () => {
    for (const kinds of [['meta'], ['free-community'], ['meta', 'free-community'], []] as const) {
      const t = text(describeRemote('x', kinds));
      expect(t).toContain('shows you');
      expect(t).toContain('Nothing is uploaded');
      expect(t).toContain('on-device render');
    }
  });
});
