import { describe, expect, it } from 'vitest';
import { LivePeaks, PeakPyramid } from '../peaks';

const SR = 1000;

/** Deterministic pseudo-random signal */
const signal = (length: number, seed = 7) => {
  const x = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 16807) % 2147483647;
    x[i] = (s / 2147483647) * 2 - 1;
  }
  return x;
};

/** Reference min/max straight from the samples */
const bruteForce = (channels: Float32Array[], s0: number, s1: number) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const ch of channels) {
    for (let i = s0; i < s1; i++) {
      lo = Math.min(lo, ch[i]);
      hi = Math.max(hi, ch[i]);
    }
  }
  return [lo, hi];
};

describe('PeakPyramid', () => {
  const left = signal(100_000);
  const right = signal(100_000, 3);
  const pyramid = new PeakPyramid([left, right], SR);

  it('knows its length, duration and peak', () => {
    expect(pyramid.length).toBe(100_000);
    expect(pyramid.duration).toBe(100);
    expect(pyramid.absMax).toBeCloseTo(Math.max(...bruteForce([left, right], 0, 100_000).map(Math.abs)), 6);
  });

  it('gives exact min/max per column when zoomed in (raw samples)', () => {
    // 10 columns over 0.5 s = 50 samples per column (< bucket size)
    const { min, max } = pyramid.columns(10, 10.5, 10);
    for (let c = 0; c < 10; c++) {
      const [lo, hi] = bruteForce([left, right], 10_000 + c * 50, 10_000 + (c + 1) * 50);
      expect(min[c]).toBe(lo);
      expect(max[c]).toBe(hi);
    }
  });

  it('matches the samples when zoomed out (pyramid levels)', () => {
    // 1024 samples per column → aligned on level buckets
    const { min, max } = pyramid.columns(0, 1024 * 50 / SR, 50);
    for (let c = 0; c < 50; c++) {
      const [lo, hi] = bruteForce([left, right], c * 1024, (c + 1) * 1024);
      expect(min[c]).toBe(lo);
      expect(max[c]).toBe(hi);
    }
  });

  it('never misses a peak at any zoom', () => {
    const spike = new Float32Array(100_000);
    spike[54_321] = 0.9;
    const p = new PeakPyramid([spike], SR);
    for (const columns of [7, 100, 999, 5000]) {
      const { max } = p.columns(0, 100, columns);
      expect(Math.max(...Array.from(max).filter((v) => !Number.isNaN(v)))).toBeCloseTo(0.9, 6);
    }
  });

  it('marks columns outside the audio as empty', () => {
    const { min, max } = pyramid.columns(95, 105, 10);
    expect(Number.isNaN(min[9])).toBe(true);
    expect(Number.isNaN(max[9])).toBe(true);
    expect(Number.isNaN(max[0])).toBe(false);
  });

  it('shows one sample per column when zoomed in beyond the sample rate', () => {
    const { max } = pyramid.columns(1, 1.002, 20);
    expect(max[0]).toBe(Math.max(left[1000], right[1000]));
  });
});

describe('LivePeaks', () => {
  it('grows as samples arrive and matches the samples', () => {
    const x = signal(10_240);
    const live = new LivePeaks(SR);
    for (let i = 0; i < x.length; i += 1000) live.push(x.subarray(i, Math.min(x.length, i + 1000)));

    expect(live.length).toBe(10_240);
    const { min, max } = live.columns(0, 10.24, 10);
    for (let c = 0; c < 10; c++) {
      const [lo, hi] = bruteForce([x], c * 1024, (c + 1) * 1024);
      expect(min[c]).toBe(lo);
      expect(max[c]).toBe(hi);
    }
  });
});
