import { describe, it, expect } from 'vitest';
import { evaluatePose, PoseStatusTracker } from '../../src/tracking/PoseQuality.js';
import { makePose } from '../helpers.js';

describe('evaluatePose', () => {
  it('reports no-person for null', () => {
    const s = evaluatePose(null);
    expect(s.code).toBe('no-person');
    expect(s.ok).toBe(false);
    expect(s.message.length).toBeGreaterThan(0);
  });

  it('accepts a framed, front-facing person', () => {
    const s = evaluatePose(makePose(), { aspect: 16 / 9 });
    expect(s.code).toBe('ok');
    expect(s.ok).toBe(true);
    expect(s.message).toBe('');
  });

  it('asks to show shoulders when one is clipped by the frame', () => {
    const s = evaluatePose(makePose({ LEFT_SHOULDER: { x: 1.02 } }));
    expect(s.code).toBe('show-shoulders');
  });

  it('tolerates missing hips (they are extrapolated) but says so', () => {
    const s = evaluatePose(makePose({ LEFT_HIP: { visibility: 0.1 }, RIGHT_HIP: { visibility: 0.1 } }));
    expect(s.code).toBe('show-hips');
    expect(s.ok).toBe(true);
  });

  it('detects too close and too far', () => {
    expect(evaluatePose(makePose({ LEFT_SHOULDER: { x: 0.9 }, RIGHT_SHOULDER: { x: 0.1 } })).code).toBe('move-back');
    // Whole body shrunk toward the frame centre = person far away.
    const far = makePose().map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.25, y: 0.5 + (l.y - 0.5) * 0.25 }));
    expect(evaluatePose(far).code).toBe('move-closer');
  });

  it('detects a turned torso', () => {
    const s = evaluatePose(makePose({ LEFT_SHOULDER: { x: 0.53 }, RIGHT_SHOULDER: { x: 0.47 }, LEFT_HIP: { y: 0.8 }, RIGHT_HIP: { y: 0.8 } }));
    expect(s.code).toBe('face-camera');
  });
});

describe('PoseStatusTracker', () => {
  it('debounces flicker but recovers quickly', () => {
    const t = new PoseStatusTracker(4, 2);
    const ok = evaluatePose(makePose());
    const bad = evaluatePose(null);
    t.update(ok); t.update(ok);
    expect(t.current.code).toBe('ok');
    t.update(bad); t.update(bad); t.update(bad);
    expect(t.current.code).toBe('ok');
    t.update(bad);
    expect(t.current.code).toBe('no-person');
    t.update(ok);
    expect(t.current.code).toBe('no-person');
    t.update(ok);
    expect(t.current.code).toBe('ok');
  });
});
