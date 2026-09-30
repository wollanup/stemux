/**
 * Magnetism to the tempo grid: only when magnetism is on and the ruler counts
 * bars (snapping to lines that are not drawn would be confusing). The lines
 * are the ones drawn at the current zoom: beats, or bars only when zoomed out.
 */

import { useAudioStore } from '../hooks/useAudioStore';
import { gridTicks } from '../tempo/tempo';
import { snapThreshold, snapToTargets } from './snapping';

/** Grid lines between two times, or none when the grid is not magnetic */
export function gridTargets(from: number, to: number, pxPerSec: number): number[] {
  const { tempo, rulerMode, snapEnabled } = useAudioStore.getState();
  if (!tempo || rulerMode !== 'bars' || !snapEnabled) return [];
  return gridTicks(Math.max(0, from), to, pxPerSec, tempo).map((tick) => tick.time);
}

/** A time stuck to the nearest grid line within reach (Alt: unchanged) */
export function snapToGrid(time: number, pxPerSec: number, alt = false): number {
  if (alt) return time;
  const threshold = snapThreshold(pxPerSec);
  return snapToTargets(time, gridTargets(time - 2 * threshold, time + 2 * threshold, pxPerSec), threshold).time;
}
