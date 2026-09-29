/**
 * Ruler gestures (no edit mode):
 * - graduation: press → the playhead jumps there, drag → it follows the
 *   pointer (precise placement), release → it stays there
 * - loop strip: drag → create a loop, click → nothing, double click on a
 *   loop → play it
 * - marker handle (loop strip): drag → move it, click → seek to it
 */

import type { LoopState } from '../types/audio';

export type RulerHit =
  | { kind: 'marker'; markerId: string; time: number }
  /** Loop strip, not on a handle (with the innermost loop under the pointer) */
  | { kind: 'strip'; loopId?: string }
  /** Graduation: moves the playhead */
  | { kind: 'time' };

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
 * in the strip where loops and handles are drawn. The graduation below only
 * moves the playhead.
 */
export function hitTest(x: number, inLoopStrip: boolean, state: Markers, pps: number): RulerHit {
  if (!inLoopStrip) return { kind: 'time' };
  const leftHanded = loopStartMarkerIds(state);
  let best: { id: string; time: number; distance: number } | null = null;
  for (const marker of state.markers) {
    const lineX = marker.time * pps;
    const onLeft = leftHanded.has(marker.id);
    const from = onLeft ? lineX - HANDLE_WIDTH : lineX - MARKER_GRAB_PX;
    const to = onLeft ? lineX + MARKER_GRAB_PX : lineX + HANDLE_WIDTH;
    if (x < from || x > to) continue;
    const distance = Math.abs(lineX - x);
    if (!best || distance < best.distance) best = { id: marker.id, time: marker.time, distance };
  }
  if (best) return { kind: 'marker', markerId: best.id, time: best.time };
  const loopId = loopAt(x / pps, state);
  return loopId ? { kind: 'strip', loopId } : { kind: 'strip' };
}

/** Innermost (shortest) loop containing a time */
export function loopAt(time: number, state: Markers): string | undefined {
  let found: { id: string; length: number } | undefined;
  for (const loop of state.loops) {
    const a = state.markers.find((m) => m.id === loop.startMarkerId)?.time;
    const b = state.markers.find((m) => m.id === loop.endMarkerId)?.time;
    if (a === undefined || b === undefined) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (time >= lo && time <= hi && (!found || hi - lo < found.length)) found = { id: loop.id, length: hi - lo };
  }
  return found?.id;
}

/** Playhead position while pressing/dragging on the graduation */
export function scrubTime(x: number, pps: number, duration: number): number {
  return Math.max(0, Math.min(duration, x / pps));
}

/** Action to perform when the pointer is released */
export function resolveGesture(hit: RulerHit, downX: number, upX: number, pps: number, duration: number): RulerAction {
  const moved = Math.abs(upX - downX) >= DRAG_THRESHOLD_PX;
  const clampTime = (x: number) => Math.max(0, Math.min(duration, x / pps));

  if (hit.kind === 'time') {
    // The playhead followed the pointer: it ends where the pointer is released
    return { type: 'seek', time: scrubTime(upX, pps, duration) };
  }

  if (hit.kind === 'marker') {
    return moved
      ? { type: 'moveMarker', markerId: hit.markerId, time: clampTime(upX) }
      : { type: 'seek', time: hit.time };
  }

  // Loop strip: a click does nothing (no playhead move), a drag creates a loop
  if (!moved) return { type: 'none' };

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
