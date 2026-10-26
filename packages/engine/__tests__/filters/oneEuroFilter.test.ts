/**
 * @module __tests__/filters/oneEuroFilter.test
 *
 * Tests for the One Euro filter: convergence, jitter reduction, and latency.
 */

import { describe, it, expect } from 'vitest';
import { OneEuroFilter, OneEuroFilterBank } from '../../src/filters/OneEuroFilter';

describe('OneEuroFilter', () => {
  it('returns the input value on first sample', () => {
    const filter = new OneEuroFilter();
    const result = filter.filter(5.0, 0);
    expect(result).toBe(5.0);
  });

  it('converges to a steady signal', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.0 });
    // Feed a constant value
    let val = 0;
    for (let i = 0; i < 60; i++) {
      val = filter.filter(10.0, i / 60);
    }
    // Should converge close to 10.0
    expect(val).toBeCloseTo(10.0, 1);
  });

  it('reduces jitter on a noisy signal', () => {
    const filter = new OneEuroFilter({ minCutoff: 0.5, beta: 0.0 });
    const baseValue = 100;
    const results: number[] = [];

    // Feed noisy signal
    for (let i = 0; i < 120; i++) {
      const noise = (Math.random() - 0.5) * 10; // ±5 noise
      const filtered = filter.filter(baseValue + noise, i / 60);
      if (i > 30) results.push(filtered); // Skip warmup
    }

    // Filtered signal should have much less variance than raw noise
    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const variance = results.reduce((a, b) => a + (b - mean) ** 2, 0) / results.length;
    const stddev = Math.sqrt(variance);

    // Raw noise stddev ≈ 2.9 (uniform ±5), filtered should be much lower
    expect(stddev).toBeLessThan(2.5);
    // Mean should be close to base value
    expect(mean).toBeCloseTo(baseValue, 0);
  });

  it('has low latency for fast movements (high beta)', () => {
    const filter = new OneEuroFilter({ minCutoff: 0.5, beta: 0.5 });

    // Simulate a sudden jump from 0 to 100
    filter.filter(0, 0);
    filter.filter(0, 1 / 60);
    filter.filter(0, 2 / 60);

    // Jump!
    const afterJump1 = filter.filter(100, 3 / 60);
    const afterJump2 = filter.filter(100, 4 / 60);
    const afterJump3 = filter.filter(100, 5 / 60);

    // With high beta, it should track fast movements quickly
    // After 3 frames, should be mostly caught up
    expect(afterJump3).toBeGreaterThan(50);
  });

  it('resets state correctly', () => {
    const filter = new OneEuroFilter();
    filter.filter(50, 0);
    filter.filter(50, 1 / 60);
    filter.reset();

    // After reset, should treat next input as first sample
    const result = filter.filter(100, 2 / 60);
    expect(result).toBe(100);
  });

  it('allows runtime config updates', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.0 });
    filter.filter(10, 0);
    filter.setConfig({ beta: 1.0 });
    // Should not throw
    const result = filter.filter(20, 1 / 60);
    expect(typeof result).toBe('number');
  });
});

describe('OneEuroFilterBank', () => {
  it('filters multi-dimensional values', () => {
    const bank = new OneEuroFilterBank(3);
    const result = bank.filter([1.0, 2.0, 3.0], 0);
    expect(result).toEqual([1.0, 2.0, 3.0]); // First sample = passthrough
  });

  it('has correct length', () => {
    const bank = new OneEuroFilterBank(4);
    expect(bank.length).toBe(4);
  });

  it('applies smoothing per dimension independently', () => {
    const bank = new OneEuroFilterBank(2, { minCutoff: 0.5, beta: 0.0 });

    // Feed different signals to each dimension
    bank.filter([0, 100], 0);
    let result = [0, 0];
    for (let i = 1; i < 60; i++) {
      result = bank.filter([100, 0], i / 60);
    }

    // Both should converge toward their steady values
    expect(result[0]).toBeGreaterThan(90);
    expect(result[1]).toBeLessThan(10);
  });

  it('resets all filters', () => {
    const bank = new OneEuroFilterBank(2);
    bank.filter([10, 20], 0);
    bank.filter([10, 20], 1 / 60);
    bank.reset();

    const result = bank.filter([50, 60], 2 / 60);
    expect(result).toEqual([50, 60]);
  });
});
