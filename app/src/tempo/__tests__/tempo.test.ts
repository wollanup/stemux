import { describe, expect, it } from 'vitest';
import { barBeatAt, formatBarBeat, gridSnapTargets, gridTicks, offsetFromDownbeat } from '../tempo';
import { addTap, bpmFromTaps } from '../tapTempo';

const t120 = { bpm: 120, beatsPerBar: 4, beatUnit: 4, offset: 1 };

describe('tempo grid', () => {
  it('gives bar and beat of a time', () => {
    expect(barBeatAt(1, t120)).toEqual({ bar: 1, beat: 1 });
    expect(barBeatAt(1.5, t120)).toEqual({ bar: 1, beat: 2 });
    expect(barBeatAt(3.01, t120)).toEqual({ bar: 2, beat: 1 });
    // Before bar 1: pickup bar 0
    expect(barBeatAt(0.5, t120)).toEqual({ bar: 0, beat: 4 });
    expect(formatBarBeat(4.6, t120)).toBe('2.4');
  });

  it('draws beats when zoomed in, spaced bars when zoomed out', () => {
    const near = gridTicks(1, 3, 100, t120);
    expect(near.map((t) => t.time)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(near.filter((t) => t.bar).map((t) => t.bar)).toEqual([1, 2]);

    const far = gridTicks(1, 65, 2, t120);
    // A bar is 4px: every 4th bar has a line (8px... doubled until >= 10px -> 16px)
    const bars = far.map((t) => t.bar);
    expect(bars.every((b) => b !== undefined)).toBe(true);
    expect(bars.slice(0, 3)).toEqual([1, 5, 9]);
    // Labels at least 44px apart: every 16 bars
    expect(far.filter((t) => t.label).map((t) => t.bar)).toEqual([1, 17, 33]);
  });

  it('snaps near beats only', () => {
    expect(gridSnapTargets(2.2, t120, 1)).toEqual([1.5, 2, 2.5]);
    expect(gridSnapTargets(0.1, t120, 2)).toEqual([0, 0.5, 1]);
  });

  it('moves bar 1 to a downbeat, modulo one bar', () => {
    expect(offsetFromDownbeat(9.25, t120)).toBeCloseTo(1.25);
  });
});

describe('tap tempo', () => {
  const tapAll = (times: number[]) => times.reduce<number[]>((taps, t) => addTap(taps, t), []);

  it('averages the intervals', () => {
    expect(bpmFromTaps(tapAll([0]))).toBeNull();
    expect(bpmFromTaps(tapAll([0, 0.5, 1.02, 1.5, 2]))).toBeCloseTo(120);
  });

  it('starts again after a pause or a tap far off', () => {
    expect(tapAll([0, 0.5, 1, 4, 4.4])).toEqual([4, 4.4]);
    expect(tapAll([0, 0.5, 1, 1.2])).toEqual([1, 1.2]);
  });
});
