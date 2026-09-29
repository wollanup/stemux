/**
 * Zoom levels (px per second, 0 = whole piece) and their slider positions
 */

export const MAX_ZOOM = 500;

export const ZOOM_PRESETS = [
  { zoom: 0, slider: 0 },
  { zoom: 1, slider: 5 },
  { zoom: 5, slider: 20 },
  { zoom: 10, slider: 40 },
  { zoom: 50, slider: 60 },
  { zoom: 250, slider: 80 },
  { zoom: 500, slider: 100 },
];

export function sliderFromZoom(zoom: number): number {
  const preset = ZOOM_PRESETS.find((p) => p.zoom === zoom);
  if (preset) return preset.slider;
  if (zoom <= 0) return 0;
  return Math.min(Math.max(Math.round((Math.log(zoom) / Math.log(2.74)) * 20), 0), 100);
}

export function zoomFromSlider(slider: number): number {
  const preset = ZOOM_PRESETS.find((p) => p.slider === slider);
  if (preset) return preset.zoom;
  if (slider <= 0) return 0;
  return Math.min(Math.round(Math.pow(2.74, slider / 20)), MAX_ZOOM);
}

/** Next preset above the current zoom (the current effective zoom may be "fit") */
export function zoomInFrom(effectivePxPerSecond: number): number {
  const next = ZOOM_PRESETS.find((p) => p.zoom > effectivePxPerSecond * 1.01);
  return next ? next.zoom : MAX_ZOOM;
}

/** Previous preset below the current zoom, 0 (fit) at the end */
export function zoomOutFrom(effectivePxPerSecond: number, fitPxPerSecond: number): number {
  const lower = [...ZOOM_PRESETS].reverse().find((p) => p.zoom > 0 && p.zoom < effectivePxPerSecond * 0.99);
  return !lower || lower.zoom <= fitPxPerSecond ? 0 : lower.zoom;
}
