/**
 * Invisible strip on an edge that resizes something by dragging.
 * Double click resets to the default size.
 */

import { useRef } from 'react';
import classes from './ResizeHandle.module.css';

interface ResizeHandleProps {
  /** 'x' = vertical strip on the right edge, 'y' = horizontal strip on the bottom edge */
  axis: 'x' | 'y';
  /** Called while dragging with the distance from the start (px) */
  onResize: (delta: number) => void;
  onEnd: () => void;
  onReset: () => void;
  label: string;
}

export default function ResizeHandle({ axis, onResize, onEnd, onReset, label }: ResizeHandleProps) {
  const start = useRef<{ pointerId: number; pos: number } | null>(null);
  const position = (e: React.PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);

  return (
    <div
      className={`${classes.handle} ${classes[axis]}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pointerId: e.pointerId, pos: position(e) };
      }}
      onPointerMove={(e) => {
        if (start.current?.pointerId !== e.pointerId) return;
        onResize(position(e) - start.current.pos);
      }}
      onPointerUp={(e) => {
        if (start.current?.pointerId !== e.pointerId) return;
        start.current = null;
        onEnd();
      }}
      onPointerCancel={() => {
        start.current = null;
        onEnd();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
