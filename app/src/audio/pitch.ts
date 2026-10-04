/**
 * Pitch shift: whole semitones to transpose, cents to fine tune
 * (100 cents = 1 semitone, the unit tuners show).
 *
 * The shift is stored as one value in semitones, the unit the stretch engine
 * takes, rounded to the cent.
 */

export const CENTS_PER_SEMITONE = 100;

/** Widest shift, either way (semitones) */
export const PITCH_RANGE = 12;

/** Clamped to the range, rounded to the cent (no float noise from repeated steps) */
export const normalizePitch = (semitones: number): number => {
  if (!Number.isFinite(semitones)) return 0;
  const clamped = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, semitones));
  return Math.round(clamped * CENTS_PER_SEMITONE) / CENTS_PER_SEMITONE || 0; // `|| 0`: no -0
};

/** Nearest whole semitones, and the rest in cents (-50 to +50) */
export const splitPitch = (pitch: number): { semitones: number; cents: number } => {
  const totalCents = Math.round(normalizePitch(pitch) * CENTS_PER_SEMITONE);
  const semitones = Math.round(totalCents / CENTS_PER_SEMITONE) || 0;
  return { semitones, cents: totalCents - semitones * CENTS_PER_SEMITONE };
};

/** Shift from whole semitones and cents */
export const joinPitch = (semitones: number, cents: number): number =>
  normalizePitch(semitones + cents / CENTS_PER_SEMITONE);
