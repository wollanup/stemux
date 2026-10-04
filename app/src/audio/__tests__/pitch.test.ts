import { describe, expect, it } from 'vitest';
import { joinPitch, normalizePitch, splitPitch } from '../pitch';

describe('pitch shift', () => {
  it('splits into whole semitones and cents', () => {
    expect(splitPitch(2.3)).toEqual({ semitones: 2, cents: 30 });
    expect(splitPitch(-0.25)).toEqual({ semitones: 0, cents: -25 });
    // Past half a semitone, the nearest semitone is taken
    expect(splitPitch(1.7)).toEqual({ semitones: 2, cents: -30 });
    expect(splitPitch(0)).toEqual({ semitones: 0, cents: 0 });
  });

  it('joins semitones and cents back, cents rolling over into semitones', () => {
    expect(joinPitch(-1, 15)).toBe(-0.85);
    expect(splitPitch(joinPitch(0, 55))).toEqual({ semitones: 1, cents: -45 });
  });

  it('leaves no float noise after repeated cent steps', () => {
    let pitch = 0;
    for (let i = 0; i < 30; i++) pitch = joinPitch(splitPitch(pitch).semitones, splitPitch(pitch).cents + 5);
    expect(pitch).toBe(1.5);
  });

  it('clamps to an octave either way and rejects invalid values', () => {
    expect(normalizePitch(13)).toBe(12);
    expect(joinPitch(-12, -40)).toBe(-12);
    expect(normalizePitch(NaN)).toBe(0);
    expect(Object.is(normalizePitch(-0.001), -0)).toBe(false);
  });
});
