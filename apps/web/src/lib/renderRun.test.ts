import { describe, it, expect } from 'vitest';
import { startRender, isCurrentRender, cancelRenders } from './renderRun';

describe('renderRun', () => {
  it('only the newest render stays current', () => {
    const a = startRender();
    expect(isCurrentRender(a)).toBe(true);
    const b = startRender();
    expect(isCurrentRender(a)).toBe(false);
    expect(isCurrentRender(b)).toBe(true);
  });

  it('cancelling invalidates the render in flight', () => {
    const a = startRender();
    cancelRenders();
    expect(isCurrentRender(a)).toBe(false);
  });
});
