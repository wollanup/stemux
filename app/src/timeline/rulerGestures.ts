/**
 * Ruler gestures (no edit mode):
 * - graduation: press → the playhead jumps there, drag → it follows the
 *   pointer (precise placement), release → it stays there
 * - loop strip: drag → create a loop, click → new marker
 * - loop (in the strip): drag → move it, double click → play it
 * - marker handle (loop strip): drag → move it, click → seek to it
 */

import type { LoopState } from '../types/audio';

export type RulerHit =
  | { kind: 'marker'; markerId: string; time: number }
  /** Loop strip, on a loop but not on a handle (innermost loop, with its bounds) */
  | { kind: 'loop'; loopId: string; start: number; end: number }
  /** Loop strip, outside any loop */
  | { kind: 'strip' }
  /** Graduation: moves the playhead */
  | { kind: 'time' };

export type RulerAction =
  | { type: 'seek'; time: number }
  | { type: 'createLoop'; start: number; end: number }
  | { type: 'addMarker'; time: number }
  | { type: 'moveMarker'; markerId: string; time: number }
  | { type: 'moveLoop'; loopId: string; delta: number }
  | { type: 'none' };

/** Grab distance on the line side of a marker, in px (defaults: see rulerLayout) */
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
export function hitTest(
  x: number,
  inLoopStrip: boolean,
  state: Markers,
  pps: number,
  sizes: { handle: number; grab: number } = { handle: HANDLE_WIDTH, grab: MARKER_GRAB_PX }
): RulerHit {
  if (!inLoopStrip) return { kind: 'time' };
  const leftHanded = loopStartMarkerIds(state);
  let best: { id: string; time: number; distance: number } | null = null;
  for (const marker of state.markers) {
    const lineX = marker.time * pps;
    const onLeft = leftHanded.has(marker.id);
    const from = onLeft ? lineX - sizes.handle : lineX - sizes.grab;
    const to = onLeft ? lineX + sizes.grab : lineX + sizes.handle;
    if (x < from || x > to) continue;
    const distance = Math.abs(lineX - x);
    if (!best || distance < best.distance) best = { id: marker.id, time: marker.time, distance };
  }
  if (best) return { kind: 'marker', markerId: best.id, time: best.time };
  const loop = loopAt(x / pps, state);
  return loop ? { kind: 'loop', loopId: loop.id, start: loop.start, end: loop.end } : { kind: 'strip' };
}

/** Innermost (shortest) loop containing a time */
export function loopAt(time: number, state: Markers): { id: string; start: number; end: number } | undefined {
  let found: { id: string; start: number; end: number; length: number } | undefined;
  for (const loop of state.loops) {
    const a = state.markers.find((m) => m.id === loop.startMarkerId)?.time;
    const b = state.markers.find((m) => m.id === loop.endMarkerId)?.time;
    if (a === undefined || b === undefined) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (time >= lo && time <= hi && (!found || hi - lo < found.length)) found = { id: loop.id, start: lo, end: hi, length: hi - lo };
  }
  return found && { id: found.id, start: found.start, end: found.end };
}

/** Playhead position while pressing/dragging on the graduation */
export function scrubTime(x: number, pps: number, duration: number): number {
  return Math.max(0, Math.min(duration, x / pps));
}

type Snap = (time: number) => number;
const noSnap: Snap = (time) => time;

/**
 * Shift of a dragged loop, in seconds: it stays within the piece. With
 * magnetism, the edge closest to a grid line sticks to it.
 */
export function loopShift(hit: Extract<RulerHit, { kind: 'loop' }>, downX: number, x: number, pps: number, duration: number, snap: Snap = noSnap): number {
  const clamp = (shift: number) => Math.max(-hit.start, Math.min(duration - hit.end, shift));
  const shift = clamp((x - downX) / pps);
  const byStart = snap(hit.start + shift) - (hit.start + shift);
  const byEnd = snap(hit.end + shift) - (hit.end + shift);
  const correction = byStart === 0 ? byEnd : byEnd === 0 || Math.abs(byStart) <= Math.abs(byEnd) ? byStart : byEnd;
  return clamp(shift + correction);
}

/** Action to perform when the pointer is released (`snap`: magnetism of markers and loops) */
export function resolveGesture(hit: RulerHit, downX: number, upX: number, pps: number, duration: number, snap: Snap = noSnap): RulerAction {
  const moved = Math.abs(upX - downX) >= DRAG_THRESHOLD_PX;
  const clampTime = (x: number) => Math.max(0, Math.min(duration, snap(Math.max(0, Math.min(duration, x / pps)))));

  if (hit.kind === 'time') {
    // The playhead followed the pointer: it ends where the pointer is released
    return { type: 'seek', time: scrubTime(upX, pps, duration) };
  }

  if (hit.kind === 'marker') {
    return moved
      ? { type: 'moveMarker', markerId: hit.markerId, time: clampTime(upX) }
      : { type: 'seek', time: hit.time };
  }

  // Loop strip: a click adds a marker outside loops (inside, a double click plays the loop)
  if (!moved) return hit.kind === 'strip' ? { type: 'addMarker', time: clampTime(upX) } : { type: 'none' };

  // Dragging a loop moves it
  if (hit.kind === 'loop') {
    const delta = loopShift(hit, downX, upX, pps, duration, snap);
    return delta === 0 ? { type: 'none' } : { type: 'moveLoop', loopId: hit.loopId, delta };
  }

  // Elsewhere in the strip, a drag creates a loop

  const a = clampTime(downX);
  const b = clampTime(upX);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return end - start >= MIN_LOOP_SECONDS ? { type: 'createLoop', start, end } : { type: 'none' };
}

/** Mouse cursor: hand where a click seeks, horizontal arrow on handles, grab on loops, copy where a click adds a marker */
export function cursorFor(hit: RulerHit, dragging = false): string {
  switch (hit.kind) {
    case 'marker':
      return 'ew-resize';
    case 'loop':
      return dragging ? 'grabbing' : 'grab';
    case 'strip':
      return dragging ? 'crosshair' : 'copy';
    case 'time':
      return 'pointer';
  }
}
