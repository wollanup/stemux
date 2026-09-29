/**
 * Ruler gestures (no edit mode):
 * - click on the graduation → seek
 * - click in the loop strip → nothing (it is for editing loops)
 * - drag (anywhere but a handle) → create a loop
 * - drag a marker handle → move it
 */

import type { LoopState } from '../types/audio';

export type RulerHit =
  | { kind: 'marker'; markerId: string; time: number }
  /** Loop strip, not on a handle */
  | { kind: 'strip' }
  /** Graduation, not on a handle */
  | { kind: 'empty' };

export type RulerAction =
  | { type: 'seek'; time: number }
  | { type: 'createLoop'; start: number; end: number }
  | { type: 'moveMarker'; markerId: string; time: number }
  | { type: 'none' };

/** Grab distance on the line side of a marker, in px */
export const MARKER_GRAB_PX = 6;
/** Width of a marker handle (flag), drawn beside its line */
export const HANDLE_WIDTH = 18;
/** Movement below which a gesture is a click, in px */
export const DRAG_THRESHOLD_PX = 4;
/** Shorter loops are ignored (accidental drags) */
export const MIN_LOOP_SECONDS = 0.1;

type Markers = Pick<LoopState, 'markers' | 'loops'>;

/** Earliest marker of each loop: its handle goes on the left, so loops read as ( ... ) */
export function loopStartMarkerIds(state: Markers, timeOf?: (id: string) => number | undefined): Set<string> {
  const time = timeOf ?? ((id: string) => state.markers.find((m) => m.id === id)?.time);
  return new Set(
    state.loops.map((l) => ((time(l.startMarkerId) ?? 0) <= (time(l.endMarkerId) ?? 0) ? l.startMarkerId : l.endMarkerId))
  );
}

/**
 * What is under the pointer. `x` is in content pixels; `inLoopStrip` is true
 * in the strip where loops and handles are drawn. Below it (graduation) only
 * the marker line itself can be grabbed.
 */
export function hitTest(x: number, inLoopStrip: boolean, state: Markers, pps: number): RulerHit {
  const leftHanded = loopStartMarkerIds(state);
  let best: { id: string; time: number; distance: number } | null = null;
  for (const marker of state.markers) {
    const lineX = marker.time * pps;
    const onLeft = leftHanded.has(marker.id);
    const handle = inLoopStrip ? HANDLE_WIDTH : MARKER_GRAB_PX;
    const from = onLeft ? lineX - handle : lineX - MARKER_GRAB_PX;
    const to = onLeft ? lineX + MARKER_GRAB_PX : lineX + handle;
    if (x < from || x > to) continue;
    const distance = Math.abs(lineX - x);
    if (!best || distance < best.distance) best = { id: marker.id, time: marker.time, distance };
  }
  if (best) return { kind: 'marker', markerId: best.id, time: best.time };
  return inLoopStrip ? { kind: 'strip' } : { kind: 'empty' };
}

/** Action to perform when the pointer is released */
export function resolveGesture(hit: RulerHit, downX: number, upX: number, pps: number, duration: number): RulerAction {
  const moved = Math.abs(upX - downX) >= DRAG_THRESHOLD_PX;
  const clampTime = (x: number) => Math.max(0, Math.min(duration, x / pps));

  if (hit.kind === 'marker') {
    return moved
      ? { type: 'moveMarker', markerId: hit.markerId, time: clampTime(upX) }
      : { type: 'seek', time: hit.time };
  }

  if (!moved) {
    // The loop strip is for editing loops: a click there does not move the playhead
    return hit.kind === 'strip' ? { type: 'none' } : { type: 'seek', time: clampTime(downX) };
  }

  const a = clampTime(downX);
  const b = clampTime(upX);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return end - start >= MIN_LOOP_SECONDS ? { type: 'createLoop', start, end } : { type: 'none' };
}

/** Mouse cursor: hand where a click seeks, horizontal arrow on handles */
export function cursorFor(hit: RulerHit): string {
  if (hit.kind === 'marker') return 'ew-resize';
  return hit.kind === 'strip' ? 'default' : 'pointer';
}
