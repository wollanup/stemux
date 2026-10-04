import { describe, expect, it } from 'vitest';
import { normalizePitch, normalizePitchShift, pitchShiftSemitones, toPitchShift } from '../pitch';

describe('pitch shift', () => {
  it('keeps semitones and cents as set, even at half a semitone', () => {
    expect(normalizePitchShift({ semitones: 2, cents: 50 })).toEqual({ semitones: 2, cents: 50 });
    expect(normalizePitchShift({ semitones: 3, cents: -50 })).toEqual({ semitones: 3, cents: -50 });
  });

  it('keeps cents within -50 to +50, never rolling over into semitones', () => {
    expect(normalizePitchShift({ semitones: 0, cents: 55 })).toEqual({ semitones: 0, cents: 50 });
    expect(normalizePitchShift({ semitones: 1, cents: -70 })).toEqual({ semitones: 1, cents: -50 });
  });

  it('stays within an octave either way, in whole values', () => {
    expect(normalizePitchShift({ semitones: 14, cents: 30 })).toEqual({ semitones: 12, cents: 0 });
    expect(normalizePitchShift({ semitones: -12, cents: 20 })).toEqual({ semitones: -12, cents: 20 });
    expect(normalizePitchShift({ semitones: 1.4, cents: NaN })).toEqual({ semitones: 1, cents: 0 });
    expect(Object.is(normalizePitchShift({ semitones: -0.2, cents: -0.3 }).semitones, -0)).toBe(false);
  });

  it('gives the engine the total in semitones', () => {
    expect(pitchShiftSemitones({ semitones: -1, cents: 15 })).toBe(-0.85);
    expect(normalizePitch(13)).toBe(12);
    expect(normalizePitch(NaN)).toBe(0);
  });

  it('reads the shift saved with a piece, none on older pieces', () => {
    expect(toPitchShift({ semitones: 2, cents: -30 })).toEqual({ semitones: 2, cents: -30 });
    expect(toPitchShift(undefined)).toEqual({ semitones: 0, cents: 0 });
    expect(toPitchShift(1.5)).toEqual({ semitones: 0, cents: 0 });
  });
});
