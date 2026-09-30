/**
 * Marker times while a handle or a loop is dragged in the ruler. The store is
 * only updated on release; the ruler and the lanes overlay both draw this
 * preview meanwhile, so everything follows the pointer.
 */

import { useSyncExternalStore } from 'react';
import type { Marker } from '../types/audio';

/** New time of each moved marker, by id */
export type MarkerPreview = Record<string, number> | null;

let preview: MarkerPreview = null;
const listeners = new Set<() => void>();

export const setMarkerPreview = (next: MarkerPreview) => {
  if (next === preview) return;
  preview = next;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMarkerPreview = () => useSyncExternalStore(subscribe, () => preview);

/** Markers with the dragged ones at their new place (order kept: numbers do not change mid-drag) */
export const applyMarkerPreview = (markers: Marker[], moved: MarkerPreview): Marker[] =>
  moved ? markers.map((m) => (m.id in moved ? { ...m, time: moved[m.id] } : m)) : markers;
