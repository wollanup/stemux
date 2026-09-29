/**
 * Ruler gestures (no edit mode):
 * - click → seek
 * - drag on empty space → create a loop
 * - drag a marker / loop edge → move it
 * - click on a loop (loop strip) → toggle it
 */

import type { LoopState } from '../types/audio';

export type RulerHit =
  | { kind: 'marker'; markerId: string; time: number }
  | { kind: 'loop'; loopId: string }
  | { kind: 'empty' };

export type RulerAction =
  | { type: 'seek'; time: number }
  | { type: 'createLoop'; start: number; end: number }
  | { type: 'moveMarker'; markerId: string; time: number }
  | { type: 'toggleLoop'; loopId: string }
  | { type: 'none' };

/** Grab distance around a marker, in px */
export const MARKER_GRAB_PX = 8;
/** Movement below which a gesture is a click, in px */
export const DRAG_THRESHOLD_PX = 4;
/** Shorter loops are ignored (accidental drags) */
export const MIN_LOOP_SECONDS = 0.1;

type Markers = Pick<LoopState, 'markers' | 'loops'>;

/**
 * What is under the pointer. `x` is in content pixels; `inLoopStrip` is true
 * in the strip where loops are drawn (clicking a loop there toggles it).
 */
export function hitTest(x: number, inLoopStrip: boolean, state: Markers, pps: number): RulerHit {
  let best: { id: string; time: number; distance: number } | null = null;
  for (const marker of state.markers) {
    const distance = Math.abs(marker.time * pps - x);
    if (distance <= MARKER_GRAB_PX && (!best || distance < best.distance)) {
      best = { id: marker.id, time: marker.time, distance };
    }
  }
  if (best) return { kind: 'marker', markerId: best.id, time: best.time };

  if (inLoopStrip) {
    const time = x / pps;
    // Innermost (shortest) loop under the pointer
    let found: { id: string; length: number } | null = null;
    for (const loop of state.loops) {
      const start = state.markers.find((m) => m.id === loop.startMarkerId)?.time;
      const end = state.markers.find((m) => m.id === loop.endMarkerId)?.time;
      if (start === undefined || end === undefined) continue;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      if (time >= lo && time <= hi && (!found || hi - lo < found.length)) {
        found = { id: loop.id, length: hi - lo };
      }
    }
    if (found) return { kind: 'loop', loopId: found.id };
  }
  return { kind: 'empty' };
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
    return hit.kind === 'loop' ? { type: 'toggleLoop', loopId: hit.loopId } : { type: 'seek', time: clampTime(downX) };
  }

  const a = clampTime(downX);
  const b = clampTime(upX);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return end - start >= MIN_LOOP_SECONDS ? { type: 'createLoop', start, end } : { type: 'none' };
}
