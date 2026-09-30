import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Wheel distance (px) for one step: about half a mouse wheel notch */
export const WHEEL_STEP_PX = 50;
const LINE_PX = 40;

/**
 * Whole steps in an accumulated wheel distance. Up (negative delta) is a
 * positive step; the remainder is kept so that touchpads (many small
 * deltas) move as smoothly as a mouse wheel.
 */
export function wheelSteps(accumulated: number, delta: number, deltaMode = 0): { steps: number; rest: number } {
  const total = accumulated - delta * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? WHEEL_STEP_PX * 4 : 1);
  const steps = Math.trunc(total / WHEEL_STEP_PX);
  return { steps, rest: total - steps * WHEEL_STEP_PX };
}

/**
 * The wheel over an element (a volume slider) adjusts a value instead of
 * scrolling. Returns a ref callback to put on the element.
 */
export function useWheelAdjust<T extends HTMLElement = HTMLElement>(onSteps: (steps: number) => void, enabled = true) {
  const [element, setElement] = useState<T | null>(null);
  const callback = useRef(onSteps);
  useLayoutEffect(() => {
    callback.current = onSteps;
  });

  useEffect(() => {
    if (!element || !enabled) return;
    let rest = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // Ctrl + wheel zooms the timeline
      e.preventDefault();
      // Vertical wheel, or horizontal one (right = up)
      const delta = e.deltaY !== 0 ? e.deltaY : -e.deltaX;
      const result = wheelSteps(rest, delta, e.deltaMode);
      rest = result.rest;
      if (result.steps !== 0) callback.current(result.steps);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [element, enabled]);

  return setElement;
}
