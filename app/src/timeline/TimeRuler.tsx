/**
 * Global time ruler. Loop strip on top (loops and marker flags), graduation
 * below. No edit mode: click on the graduation = seek, click in the strip =
 * new marker, drag in the strip = new loop, drag a marker or a loop = move
 * it, double click a loop = play it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { alpha, useMantineTheme } from '@mantine/core';
import { contrastText, useAppPalette } from '../theme/palette';
import { useAudioStore } from '../hooks/useAudioStore';
import type { LoopState } from '../types/audio';
import { LOOP_COLORS, loopColor, markerColor, nextColor } from '../utils/colors';
import { formatTimeLabel, tickSpacing, ticks } from './timelineMath';
import { getView, subscribeView } from './viewStore';
import { cursorFor, DRAG_THRESHOLD_PX, hitTest, loopShift, loopStartMarkerIds, resolveGesture, scrubTime, type RulerHit } from './rulerGestures';
import { applyMarkerPreview, setMarkerPreview, useMarkerPreview, type MarkerPreview } from './markerPreview';
import { GRADUATION_HEIGHT } from './layout';
import { useRulerLayout } from './useRulerLayout';
import { gridTicks } from '../tempo/tempo';
import { snapToGrid } from './gridSnap';

interface TimeRulerProps {
  width: number;
  pxPerSec: number;
  duration: number;
  playheadRef: React.RefObject<HTMLDivElement | null>;
}

interface Drag {
  pointerId: number;
  hit: RulerHit;
  downX: number;
  x: number;
  /** Alt held: no magnetism */
  alt: boolean;
}

/** Magnetism of markers and loops to the tempo grid during a drag */
const snapFor = (drag: Pick<Drag, 'alt'>, pxPerSec: number) => (time: number) => snapToGrid(time, pxPerSec, drag.alt);

const DOUBLE_TAP_MS = 350;

/** Graduation, drawn for the visible part only: seconds, or bars when the ruler counts bars */
function Graduation({ top }: { top: number }) {
  const theme = useMantineTheme();
  const palette = useAppPalette();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = GRADUATION_HEIGHT;
  const tempo = useAudioStore((s) => s.tempo);
  const bars = useAudioStore((s) => s.rulerMode === 'bars') && tempo !== null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { pxPerSec, scrollLeft, viewportWidth } = getView();
    const width = Math.max(1, Math.floor(viewportWidth));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.left = `${scrollLeft}px`;
    canvas.style.width = `${width}px`;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    g.font = `11px ${theme.fontFamily}`;
    g.textBaseline = 'top';
    const from = scrollLeft / pxPerSec;
    const to = (scrollLeft + width) / pxPerSec;

    if (bars && tempo) {
      // Bars: a long line and its number on each bar, short ticks on beats
      for (const tick of gridTicks(from, to, pxPerSec, tempo)) {
        const x = Math.round(tick.time * pxPerSec - scrollLeft) + 0.5;
        const isBar = tick.bar !== undefined;
        g.fillStyle = isBar && tick.label ? palette.dimmed : palette.border;
        g.fillRect(x, isBar ? (tick.label ? 0 : height / 2) : height - 6, 1, isBar ? height : 6);
        if (tick.label) {
          g.fillStyle = palette.dimmed;
          g.fillText(String(tick.bar), x + 4, 4);
        }
      }
      return;
    }

    const { major } = tickSpacing(pxPerSec);
    for (const tick of ticks(from, to, pxPerSec)) {
      const x = Math.round(tick.time * pxPerSec - scrollLeft) + 0.5;
      g.fillStyle = tick.major ? palette.dimmed : palette.border;
      g.fillRect(x, tick.major ? 0 : height - 6, 1, tick.major ? height : 6);
      if (tick.major) {
        g.fillStyle = palette.dimmed;
        g.fillText(formatTimeLabel(tick.time, major), x + 4, 4);
      }
    }
  }, [theme, palette, height, bars, tempo]);

  useEffect(() => {
    draw();
    return subscribeView(draw);
  }, [draw]);

  return <canvas ref={canvasRef} data-graduation={bars ? 'bars' : 'time'} style={{ position: 'absolute', top, height, pointerEvents: 'none' }} />;
}

/** New times of the markers moved by a drag (a handle, or both ends of a loop) */
const dragPreview = (drag: Drag, loopState: LoopState, pxPerSec: number, duration: number): MarkerPreview => {
  if (Math.abs(drag.x - drag.downX) < DRAG_THRESHOLD_PX) return null;
  const { hit } = drag;
  const snap = snapFor(drag, pxPerSec);
  if (hit.kind === 'marker') return { [hit.markerId]: Math.max(0, Math.min(duration, snap(Math.max(0, Math.min(duration, drag.x / pxPerSec))))) };
  if (hit.kind !== 'loop') return null;
  const loop = loopState.loops.find((l) => l.id === hit.loopId);
  if (!loop) return null;
  const shift = loopShift(hit, drag.downX, drag.x, pxPerSec, duration, snap);
  const moved: Record<string, number> = {};
  for (const m of loopState.markers) {
    if (m.id === loop.startMarkerId || m.id === loop.endMarkerId) moved[m.id] = m.time + shift;
  }
  return moved;
};

export default function TimeRuler({ width, pxPerSec, duration, playheadRef }: TimeRulerProps) {
  const palette = useAppPalette();
  const loopState = useAudioStore((s) => s.loopState);
  const armedLoopId = useAudioStore((s) => s.armedLoopId);
  const preview = useMarkerPreview();
  const layout = useRulerLayout();
  const { strip } = layout;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverCursor, setHoverCursor] = useState('pointer');
  const lastLoopTap = useRef<{ time: number; loopId: string } | null>(null);

  // The lanes draw the preview too: never leave one behind
  useEffect(() => () => setMarkerPreview(null), []);

  const contentX = (e: React.PointerEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

  /** What is under the pointer; null in the strip when it is read-only (loops panel hidden) */
  const hitAt = (e: React.PointerEvent<HTMLDivElement>): RulerHit | null => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const inStrip = y < strip;
    if (inStrip && !layout.editable) return null;
    return hitTest(contentX(e), inStrip, loopState, pxPerSec, layout);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const x = contentX(e);
    const hit = hitAt(e);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ pointerId: e.pointerId, hit, downX: x, x, alt: e.altKey });
    // Graduation: the playhead jumps under the pointer right away
    if (hit.kind === 'time') useAudioStore.getState().seek(scrubTime(x, pxPerSec, duration));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) {
      // Hover: horizontal arrow on handles, hand where a click seeks
      const hit = hitAt(e);
      const cursor = hit ? cursorFor(hit) : 'default';
      if (cursor !== hoverCursor) setHoverCursor(cursor);
      return;
    }
    if (drag.pointerId !== e.pointerId) return;
    const x = contentX(e);
    const next = { ...drag, x, alt: e.altKey };
    setDrag(next);
    setMarkerPreview(dragPreview(next, loopState, pxPerSec, duration));
    // ...and follows it for precise placement until the button is released
    if (drag.hit.kind === 'time') useAudioStore.getState().seek(scrubTime(x, pxPerSec, duration));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const x = contentX(e);
    setDrag(null);
    setMarkerPreview(null);
    const store = useAudioStore.getState();
    const action = resolveGesture(drag.hit, drag.downX, x, pxPerSec, duration, snapFor({ alt: e.altKey }, pxPerSec));

    switch (action.type) {
      case 'none': {
        // Simple click in the loop strip: nothing; double click on a loop: play it
        const loopId = drag.hit.kind === 'loop' ? drag.hit.loopId : undefined;
        const now = performance.now();
        const previous = lastLoopTap.current;
        if (loopId && previous?.loopId === loopId && now - previous.time < DOUBLE_TAP_MS) {
          lastLoopTap.current = null;
          useAudioStore.getState().playLoop(loopId);
        } else {
          lastLoopTap.current = loopId && Math.abs(x - drag.downX) < DRAG_THRESHOLD_PX ? { time: now, loopId } : null;
        }
        break;
      }
      case 'seek':
        store.seek(action.time);
        break;
      case 'addMarker':
        store.addMarker(action.time);
        break;
      case 'createLoop': {
        // Two markers and the loop: undone at once
        const loopId = store.edit(() => {
          const startId = store.addMarker(action.start);
          const endId = store.addMarker(action.end);
          return startId && endId ? useAudioStore.getState().createLoop(startId, endId) : '';
        });
        if (loopId) useAudioStore.getState().setActiveLoop(loopId);
        break;
      }
      case 'moveMarker':
        store.updateMarkerTime(action.markerId, action.time);
        break;
      case 'moveLoop':
        store.moveLoop(action.loopId, action.delta);
        break;
    }
  };

  const markers = applyMarkerPreview(loopState.markers, preview);
  const markerTime = (id: string) => markers.find((m) => m.id === id)?.time;
  // Earliest marker of each loop, with the one being dragged at its new place
  const loopStartIds = loopStartMarkerIds(loopState, markerTime);
  // Loop being drawn, its ends stuck to the grid like the loop it will create
  const newLoopEnds =
    drag && drag.hit.kind === 'strip' && Math.abs(drag.x - drag.downX) >= DRAG_THRESHOLD_PX
      ? [drag.downX, drag.x].map((x) => snapFor(drag, pxPerSec)(Math.max(0, Math.min(duration, x / pxPerSec))) * pxPerSec)
      : null;
  const newLoop = newLoopEnds ? { left: Math.min(...newLoopEnds), width: Math.abs(newLoopEnds[1] - newLoopEnds[0]) } : null;

  const newLoopColor = nextColor(LOOP_COLORS, loopState.loops.map((l) => loopColor(l, loopState.loops)));

  const cursor = drag ? cursorFor(drag.hit, true) : hoverCursor;

  return (
    <div
      data-testid="time-ruler"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setMarkerPreview(null);
      }}
      style={{
        position: 'relative',
        width,
        height: layout.height,
        flexShrink: 0,
        cursor,
        touchAction: 'none',
        userSelect: 'none',
        backgroundColor: 'var(--mantine-color-body)',
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
    >
      {/* Loop strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: strip, backgroundColor: alpha(palette.text, layout.editable ? 0.07 : 0.04) }} data-loop-strip={layout.editable ? 'edit' : 'read-only'} />

      {loopState.loops.map((loop) => {
        const a = markerTime(loop.startMarkerId);
        const b = markerTime(loop.endMarkerId);
        if (a === undefined || b === undefined) return null;
        const active = loop.id === loopState.activeLoopId && loop.enabled;
        const armed = loop.id === armedLoopId;
        const color = loopColor(loop, loopState.loops);
        return (
          <div
            key={loop.id}
            data-loop={loop.id}
            data-armed={armed || undefined}
            style={{
              position: 'absolute',
              top: 2,
              height: strip - 4,
              left: Math.min(a, b) * pxPerSec,
              width: Math.abs(b - a) * pxPerSec,
              backgroundColor: alpha(color, active ? 0.6 : 0.25),
              // Armed: dashed, it will loop once the playhead gets in
              border: `1px ${armed ? 'dashed' : 'solid'} ${alpha(color, active || armed ? 1 : 0.6)}`,
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {newLoop && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            height: strip - 4,
            left: newLoop.left,
            width: newLoop.width,
            backgroundColor: alpha(newLoopColor, 0.35),
            border: `1px dashed ${newLoopColor}`,
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      )}

      <Graduation top={strip} />

      {/* Marker flags (numbered in time order, like the markers panel) */}
      {markers.map((marker, index) => {
        // Loop starts get their flag on the left, so each loop reads as ( ... )
        const opensLoop = loopStartIds.has(marker.id);
        const color = markerColor(marker.id, loopState);
        return (
          <div
            key={marker.id}
            data-marker={marker.id}
            data-time={marker.time}
            style={{ position: 'absolute', top: 0, bottom: 0, left: marker.time * pxPerSec - 1, width: 2, backgroundColor: color, pointerEvents: 'none' }}
          >
            {/* Handle: fills the loop strip (not the graduation), easy to grab */}
            <div
              style={{
                position: 'absolute',
                top: 2,
                height: strip - 4,
                ...(opensLoop ? { right: 2 } : { left: 2 }),
                width: layout.handle - 2,
                boxSizing: 'border-box',
                textAlign: 'center',
                fontSize: strip >= 40 ? 14 : 11,
                lineHeight: `${strip - 4}px`,
                fontWeight: 700,
                color: contrastText(color),
                backgroundColor: color,
                borderRadius: opensLoop ? '4px 0 0 4px' : '0 4px 4px 0',
              }}
            >
              {index + 1}
            </div>
          </div>
        );
      })}

      {/* Playhead (moved by the timeline animation loop) */}
      <div
        ref={playheadRef}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 0, pointerEvents: 'none', willChange: 'transform' }}
      >
        <div style={{ position: 'absolute', top: strip, bottom: 0, left: -1, width: 2, backgroundColor: 'var(--mantine-primary-color-filled)' }} />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: -6,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '8px solid var(--mantine-primary-color-filled)',
            transform: 'translateY(-16px)',
          }}
        />
      </div>
    </div>
  );
}
