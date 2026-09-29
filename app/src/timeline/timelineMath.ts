/**
 * Pure timeline geometry: one time scale shared by the ruler, every lane and
 * the playhead. Positions are in "content pixels" (0 = start of the piece).
 */

/** Pixels per second for a zoom level (0 = whole piece fits in the viewport) */
export function pxPerSecond(zoomLevel: number, viewportWidth: number, duration: number): number {
  const fit = duration > 0 && viewportWidth > 0 ? viewportWidth / duration : 1;
  // Zooming out further than "fit" would leave the lanes half empty
  return zoomLevel > 0 ? Math.max(zoomLevel, fit) : fit;
}

export const timeToPx = (time: number, pps: number) => time * pps;
export const pxToTime = (px: number, pps: number) => px / pps;

/** Width of the scrollable lanes area */
export function contentWidth(duration: number, pps: number, viewportWidth: number): number {
  return Math.max(viewportWidth, Math.ceil(duration * pps));
}

export function visibleRange(scrollLeft: number, viewportWidth: number, pps: number) {
  return { start: scrollLeft / pps, end: (scrollLeft + viewportWidth) / pps };
}

export function clampScroll(scrollLeft: number, content: number, viewportWidth: number): number {
  return Math.max(0, Math.min(scrollLeft, Math.max(0, content - viewportWidth)));
}

/** Scroll that keeps `anchorTime` under the same viewport x after a zoom change */
export function scrollForAnchor(anchorTime: number, anchorViewportX: number, pps: number): number {
  return Math.max(0, anchorTime * pps - anchorViewportX);
}

/**
 * While playing, returns the new scroll when the playhead leaves the view
 * ("page" flip, like most audio editors), or null when it is visible.
 */
export function followScroll(playheadTime: number, scrollLeft: number, viewportWidth: number, pps: number): number | null {
  const x = playheadTime * pps;
  const rightLimit = scrollLeft + viewportWidth * 0.95;
  if (x >= scrollLeft && x <= rightLimit) return null;
  return Math.max(0, x - viewportWidth * 0.05);
}

/** Labeled steps (seconds) and how many parts each is divided into */
const STEPS: Array<[number, number]> = [
  [0.01, 2], [0.02, 2], [0.05, 5], [0.1, 2], [0.2, 2], [0.5, 5],
  [1, 4], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6],
  [60, 4], [120, 4], [300, 5], [600, 5], [1800, 6],
];

/** Ruler graduation: labeled step and number of subdivisions between labels */
export function tickSpacing(pps: number, minLabelPx = 64): { major: number; subdivisions: number } {
  const [major, parts] = STEPS.find(([step]) => step * pps >= minLabelPx) ?? STEPS[STEPS.length - 1];
  // Hide subdivisions that would be too dense
  const subdivisions = (major * pps) / parts < 6 ? 1 : parts;
  return { major, subdivisions };
}

export interface Tick {
  time: number;
  major: boolean;
}

/** Ticks covering [start, end], aligned on the graduation (no drift on scroll) */
export function ticks(start: number, end: number, pps: number): Tick[] {
  const { major, subdivisions } = tickSpacing(pps);
  const minor = major / subdivisions;
  const result: Tick[] = [];
  const first = Math.max(0, Math.floor(start / minor));
  for (let i = first; i * minor <= end + 1e-9; i++) {
    // Integer arithmetic on the index avoids accumulated float error
    result.push({ time: Math.round(i * minor * 1e6) / 1e6, major: i % subdivisions === 0 });
  }
  return result;
}

/** "m:ss", with decimals when the graduation is below one second */
export function formatTimeLabel(time: number, step = 1): string {
  const minutes = Math.floor(time / 60);
  const seconds = time - minutes * 60;
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  let s = seconds.toFixed(decimals);
  if (Number(s) >= 60) {
    return formatTimeLabel((minutes + 1) * 60, step);
  }
  if (Number(s) < 10) s = `0${s}`;
  return `${minutes}:${s}`;
}
