/** Timeline layout constants (px) and user-adjustable sizes */

/** Track header column on large screens (resizable, remembered) */
export const HEADER_WIDTH_DEFAULT = 300;
export const HEADER_WIDTH_MIN = 260;
export const HEADER_WIDTH_MAX = 520;

/** Ruler: loop strip on top (loops and marker handles), graduation below */
export const LOOP_STRIP_HEIGHT = 24;
export const RULER_HEIGHT = 48;

/** Track heights (resizable per track, saved with the piece) */
export const LANE_HEIGHT = 80;
export const LANE_HEIGHT_MOBILE = 64;
export const LANE_HEIGHT_MIN = 64;
export const LANE_HEIGHT_MAX = 400;
export const COLLAPSED_LANE_HEIGHT = 32;

/** Horizontal scrollbar, kept above the play button that overlaps the timeline bottom */
export const SCROLLBAR_HEIGHT = 12;
export const SCROLLBAR_BOTTOM_GAP = 34;

const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)));

export const clampHeaderWidth = (width: number) => clamp(width, HEADER_WIDTH_MIN, HEADER_WIDTH_MAX);
export const clampLaneHeight = (height: number) => clamp(height, LANE_HEIGHT_MIN, LANE_HEIGHT_MAX);

const HEADER_WIDTH_KEY = 'timeline-header-width';

export const loadHeaderWidth = (): number => {
  try {
    const stored = Number(localStorage.getItem(HEADER_WIDTH_KEY));
    return stored > 0 ? clampHeaderWidth(stored) : HEADER_WIDTH_DEFAULT;
  } catch {
    return HEADER_WIDTH_DEFAULT;
  }
};

export const saveHeaderWidth = (width: number | null) => {
  try {
    if (width === null) localStorage.removeItem(HEADER_WIDTH_KEY);
    else localStorage.setItem(HEADER_WIDTH_KEY, String(clampHeaderWidth(width)));
  } catch {
    // storage unavailable: the width just is not remembered
  }
};
