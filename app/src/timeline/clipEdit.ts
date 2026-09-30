/**
 * Clip editing: moving a clip on the timeline and trimming its start / end.
 * The audio file is never modified: a clip is a window on it.
 */

import { snapToTargets } from './snapping';

export interface ClipGeometry {
  /** Position of the clip on the timeline (seconds) */
  offset: number;
  /** Seconds of the file skipped at the start */
  trimStart: number;
  /** Seconds of the file played */
  duration: number;
}

export type ClipZone = 'start' | 'end' | 'body';

/** Width of the grab zone on each edge of a clip (px) */
export const EDGE_PX = 6;
/** A clip cannot be shorter than this (seconds) */
export const MIN_CLIP_SECONDS = 0.1;

/** Which part of a clip is under the pointer (x relative to the clip, px), or null outside */
export function clipZone(x: number, clipWidth: number): ClipZone | null {
  if (x < 0 || x > clipWidth) return null;
  // Small clips: keep a body to grab in the middle
  const edge = Math.min(EDGE_PX, clipWidth / 3);
  if (x <= edge) return 'start';
  if (x >= clipWidth - edge) return 'end';
  return 'body';
}

export interface EditOptions {
  /** Length of the audio file (seconds) */
  sourceDuration: number;
  /** Times to snap to (seconds), empty for none */
  targets: number[];
  /** Snap distance (seconds) */
  snapThreshold: number;
}

export interface EditResult {
  clip: ClipGeometry;
  /** Snapped time, to show a guide line */
  snappedTo: number | null;
}

/** Move the whole clip by `delta` seconds (never before 0), snapping its start or end */
export function moveClip(clip: ClipGeometry, delta: number, options: EditOptions): EditResult {
  let offset = Math.max(0, clip.offset + delta);
  let snappedTo: number | null = null;

  const start = snapToTargets(offset, options.targets, options.snapThreshold);
  const end = snapToTargets(offset + clip.duration, options.targets, options.snapThreshold);
  // Keep the closest of the two snaps
  const startGap = start.target === null ? Infinity : Math.abs(start.time - offset);
  const endGap = end.target === null ? Infinity : Math.abs(end.time - (offset + clip.duration));
  if (startGap <= endGap && start.target !== null) {
    offset = start.time;
    snappedTo = start.target;
  } else if (end.target !== null && end.time - clip.duration >= 0) {
    offset = end.time - clip.duration;
    snappedTo = end.target;
  }
  return { clip: { ...clip, offset: Math.max(0, offset) }, snappedTo };
}

/**
 * Drag the start edge by `delta` seconds: the end stays in place.
 * Positive = shorter (cut more), negative = longer (restore what was cut).
 */
export function trimClipStart(clip: ClipGeometry, delta: number, options: EditOptions): EditResult {
  const end = clip.offset + clip.duration;
  let start = clip.offset + delta;
  const snapped = snapToTargets(start, options.targets, options.snapThreshold);
  start = snapped.time;

  // Limits: not before the file start, not before 0 on the timeline, minimum length
  const earliest = Math.max(0, clip.offset - clip.trimStart);
  start = Math.max(earliest, Math.min(start, end - MIN_CLIP_SECONDS));

  const trimStart = clip.trimStart + (start - clip.offset);
  return {
    clip: { offset: start, trimStart, duration: end - start },
    snappedTo: start === snapped.time ? snapped.target : null,
  };
}

/** Drag the end edge by `delta` seconds: the start stays in place */
export function trimClipEnd(clip: ClipGeometry, delta: number, options: EditOptions): EditResult {
  let end = clip.offset + clip.duration + delta;
  const snapped = snapToTargets(end, options.targets, options.snapThreshold);
  end = snapped.time;

  // Limits: not after the file end, minimum length
  const latest = clip.offset + (options.sourceDuration - clip.trimStart);
  end = Math.max(clip.offset + MIN_CLIP_SECONDS, Math.min(end, latest));

  return {
    clip: { ...clip, duration: end - clip.offset },
    snappedTo: end === snapped.time ? snapped.target : null,
  };
}

export function editClip(zone: ClipZone, clip: ClipGeometry, delta: number, options: EditOptions): EditResult {
  if (zone === 'start') return trimClipStart(clip, delta, options);
  if (zone === 'end') return trimClipEnd(clip, delta, options);
  return moveClip(clip, delta, options);
}

export const sameGeometry = (a: ClipGeometry, b: ClipGeometry) =>
  Math.abs(a.offset - b.offset) < 1e-6 && Math.abs(a.trimStart - b.trimStart) < 1e-6 && Math.abs(a.duration - b.duration) < 1e-6;
