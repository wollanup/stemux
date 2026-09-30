/**
 * Tap tempo: the tempo follows the average interval between the last taps.
 * A pause longer than RESET_S, or a tap far off the current tempo, starts a
 * new measure.
 */

export const RESET_S = 2;
const MAX_TAPS = 12;
/** A tap this far from the expected interval restarts the count */
const TOLERANCE = 0.4;

/** Keep the taps of the current series (times in seconds, increasing) */
export function addTap(taps: number[], time: number): number[] {
  const last = taps[taps.length - 1];
  if (last === undefined || time - last > RESET_S || time <= last) return [time];
  if (taps.length >= 2) {
    const expected = (last - taps[0]) / (taps.length - 1);
    if (Math.abs(time - last - expected) > expected * TOLERANCE) return [last, time];
  }
  return [...taps, time].slice(-MAX_TAPS);
}

/** Tempo of a series of taps (null below two taps) */
export function bpmFromTaps(taps: number[]): number | null {
  if (taps.length < 2) return null;
  const interval = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  return interval > 0 ? 60 / interval : null;
}
