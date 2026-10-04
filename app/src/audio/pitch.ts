/**
 * Pitch shift: whole semitones to transpose, cents to fine tune
 * (100 cents = 1 semitone, the unit tuners show).
 *
 * Both are kept as set: +2 semitones +50 cents stays so, never shown as
 * +3 semitones -50 cents. The engine takes their sum, in semitones.
 */

export const CENTS_PER_SEMITONE = 100;

/** Widest shift, either way (semitones) */
export const PITCH_RANGE = 12;

/** Fine tuning range, either way (cents): beyond, it is a matter of semitones */
export const CENTS_RANGE = 50;

export interface PitchShift {
  /** Whole semitones, -12 to +12 */
  semitones: number;
  /** Whole cents, -50 to +50 */
  cents: number;
}

export const NO_PITCH_SHIFT: PitchShift = { semitones: 0, cents: 0 };

const clamp = (value: number, limit: number) => (Number.isFinite(value) ? Math.max(-limit, Math.min(limit, Math.round(value))) : 0) || 0; // `|| 0`: no -0

/** Whole values within their ranges, never past an octave in total */
export const normalizePitchShift = ({ semitones, cents }: PitchShift): PitchShift => {
  const s = clamp(semitones, PITCH_RANGE);
  let c = clamp(cents, CENTS_RANGE);
  if (s === PITCH_RANGE) c = Math.min(c, 0);
  if (s === -PITCH_RANGE) c = Math.max(c, 0);
  return { semitones: s, cents: c || 0 };
};

export const isPitchShifted = (pitch: PitchShift) => pitch.semitones !== 0 || pitch.cents !== 0;

export const samePitchShift = (a: PitchShift, b: PitchShift) => a.semitones === b.semitones && a.cents === b.cents;

/** Total shift in semitones, what the engine takes */
export const pitchShiftSemitones = ({ semitones, cents }: PitchShift) => semitones + cents / CENTS_PER_SEMITONE;

/** Shift saved with a piece (missing on older pieces) */
export const toPitchShift = (saved: unknown): PitchShift => {
  if (saved && typeof saved === 'object' && 'semitones' in saved && 'cents' in saved) {
    return normalizePitchShift(saved as PitchShift);
  }
  return NO_PITCH_SHIFT;
};

/** Clamped to the engine range, rounded to the cent */
export const normalizePitch = (semitones: number): number => {
  if (!Number.isFinite(semitones)) return 0;
  const clamped = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, semitones));
  return Math.round(clamped * CENTS_PER_SEMITONE) / CENTS_PER_SEMITONE || 0;
};
