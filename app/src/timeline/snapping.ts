/**
 * Magnetism: times a clip edge sticks to when dragged close enough.
 * Targets are plain times: markers, playhead, other clips, and the bar/beat
 * lines when the ruler counts bars.
 */

import type { Marker } from '../types/audio';

/** Snap distance on screen, whatever the zoom (px) */
export const SNAP_PX = 8;

export interface SnapSources {
  markers: Marker[];
  playhead: number;
  /** Start and end of the other clips */
  clipEdges: number[];
  /** Bar / beat lines (see gridSnap.ts) */
  grid?: number[];
}

/** Every time to snap to, sorted and without duplicates */
export function snapTargets({ markers, playhead, clipEdges, grid = [] }: SnapSources): number[] {
  const all = [0, playhead, ...markers.map((m) => m.time), ...clipEdges, ...grid];
  return Array.from(new Set(all.filter((t) => Number.isFinite(t) && t >= 0))).sort((a, b) => a - b);
}

/** Nearest target within the threshold, or the time unchanged */
export function snapToTargets(time: number, targets: number[], threshold: number): { time: number; target: number | null } {
  let best: number | null = null;
  for (const target of targets) {
    if (Math.abs(target - time) <= threshold && (best === null || Math.abs(target - time) < Math.abs(best - time))) {
      best = target;
    }
  }
  return best === null ? { time, target: null } : { time: best, target: best };
}

/** Snap distance in seconds at the current zoom */
export const snapThreshold = (pxPerSec: number) => SNAP_PX / pxPerSec;
