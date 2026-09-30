/**
 * Mouse drag on a lane scrolls the timeline (like grabbing a sheet of
 * paper). Touch already scrolls natively. A press without moving stays a
 * click (it moves the playhead).
 */

import { useRef, useState } from 'react';

/** Pointer movement before a press becomes a pan (px) */
const PAN_START_PX = 3;

interface Pan {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
  started: boolean;
  scroller: HTMLElement;
}

export function useLanePan() {
  const pan = useRef<Pan | null>(null);
  const [panning, setPanning] = useState(false);
  const clickHandled = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || e.button !== 0) return;
    const scroller = e.currentTarget.closest<HTMLElement>('[data-timeline-scroll]');
    if (!scroller) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop, started: false, scroller };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const current = pan.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const dx = e.clientX - current.x;
    const dy = e.clientY - current.y;
    if (!current.started) {
      if (Math.hypot(dx, dy) < PAN_START_PX) return;
      current.started = true;
      setPanning(true);
    }
    current.scroller.scrollLeft = current.scrollLeft - dx;
    current.scroller.scrollTop = current.scrollTop - dy;
  };

  const end = (e: React.PointerEvent<HTMLElement>) => {
    const current = pan.current;
    if (!current || current.pointerId !== e.pointerId) return;
    pan.current = null;
    setPanning(false);
    // A pan is not a click: do not move the playhead
    if (current.started) clickHandled.current = true;
  };

  /** To call from the lane click handler: true when the click must be ignored */
  const consumeClick = () => {
    const handled = clickHandled.current;
    clickHandled.current = false;
    return handled;
  };

  return {
    panning,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
    consumeClick,
  };
}
