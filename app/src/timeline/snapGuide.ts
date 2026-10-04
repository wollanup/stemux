/**
 * Time where a dragged clip edge snapped, shown as a guide line across the
 * lanes (outside React state: it changes on every pointer move).
 */

import { useSyncExternalStore } from 'react';

let guide: number | null = null;
const listeners = new Set<() => void>();

export const setSnapGuide = (time: number | null) => {
  if (time === guide) return;
  guide = time;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSnapGuide = () => useSyncExternalStore(subscribe, () => guide);
