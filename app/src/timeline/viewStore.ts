/**
 * Timeline view state (scale and scroll), outside React/Zustand so that
 * scrolling and zooming only redraw the canvases that subscribe to it.
 */

import { useSyncExternalStore } from 'react';

export interface TimelineView {
  /** Current scale */
  pxPerSec: number;
  /** Horizontal scroll of the lanes, in content px */
  scrollLeft: number;
  /** Visible width of the lanes area (without the header column) */
  viewportWidth: number;
}

let view: TimelineView = { pxPerSec: 1, scrollLeft: 0, viewportWidth: 0 };
const listeners = new Set<() => void>();

/** Point to keep in place on the next zoom change (mouse, pinch center...) */
let zoomAnchor: { time: number; viewportX: number } | null = null;

export const getView = () => view;

export const setView = (partial: Partial<TimelineView>) => {
  const next = { ...view, ...partial };
  if (next.pxPerSec === view.pxPerSec && next.scrollLeft === view.scrollLeft && next.viewportWidth === view.viewportWidth) {
    return;
  }
  view = next;
  listeners.forEach((l) => l());
};

export const subscribeView = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useTimelineView = () => useSyncExternalStore(subscribeView, getView);

export const setZoomAnchor = (anchor: { time: number; viewportX: number } | null) => {
  zoomAnchor = anchor;
};

export const takeZoomAnchor = () => {
  const anchor = zoomAnchor;
  zoomAnchor = null;
  return anchor;
};
