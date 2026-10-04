/**
 * Color palettes for tracks and loops.
 *
 * Colors are stored on each track / loop (not derived from its position), so
 * that the user can pick another one later: pickers should offer these
 * palettes.
 */

import type { Loop, LoopState } from '../types/audio';

/** Track colors: pastel, the waveforms are drawn with them */
export const TRACK_COLORS = [
  '#4ECDC4', '#FFA07A', '#BB8FCE', '#F7DC6F',
  '#85C1E2', '#FF6B6B', '#98D8C8', '#e680a5',
];

/**
 * Loop colors: saturated, readable on the light and dark themes, drawn over
 * the waveforms. The first one is the marker orange, used by standalone markers.
 */
export const LOOP_COLORS = [
  '#FFA726', '#26C6DA', '#EC407A', '#9CCC65',
  '#AB47BC', '#EF5350', '#5C6BC0', '#D4AC0D',
];

/** Color of markers that belong to no loop */
export const MARKER_COLOR = LOOP_COLORS[0];

/** First palette color nobody uses yet, cycling when all are taken */
export function nextColor(palette: string[], used: (string | undefined)[]): string {
  const free = palette.find((c) => !used.includes(c));
  return free ?? palette[used.length % palette.length];
}

/** Color of a loop (loops saved before colors existed get one from their position) */
export function loopColor(loop: Loop, loops: Loop[]): string {
  if (loop.color) return loop.color;
  const index = loops.findIndex((l) => l.id === loop.id);
  return LOOP_COLORS[Math.max(0, index) % LOOP_COLORS.length];
}

/**
 * Color of a marker: the one of its loop (the active one first when the
 * marker is shared by several loops), the marker orange otherwise.
 */
export function markerColor(markerId: string, loopState: Pick<LoopState, 'loops' | 'activeLoopId'>): string {
  const { loops, activeLoopId } = loopState;
  const owners = loops.filter((l) => l.startMarkerId === markerId || l.endMarkerId === markerId);
  const owner = owners.find((l) => l.id === activeLoopId) ?? owners[0];
  return owner ? loopColor(owner, loops) : MARKER_COLOR;
}
