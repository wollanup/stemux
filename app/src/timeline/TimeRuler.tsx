/**
 * Global time ruler. Loop strip on top (loops and marker flags), graduation
 * below. No edit mode: click = seek, drag = new loop, drag a marker = move it,
 * click a loop = toggle it, double click/tap = new marker.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { alpha, Box, useTheme } from '@mui/material';
import { useAudioStore } from '../hooks/useAudioStore';
import type { LoopState } from '../types/audio';
import { formatTimeLabel, tickSpacing, ticks } from './timelineMath';
import { getView, subscribeView } from './viewStore';
import { hitTest, resolveGesture, type RulerHit } from './rulerGestures';
import { LOOP_STRIP_HEIGHT, RULER_HEIGHT } from './layout';

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
}

const DOUBLE_TAP_MS = 350;

/** Graduation, drawn for the visible part only */
function Graduation() {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = RULER_HEIGHT - LOOP_STRIP_HEIGHT;

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

    const { major } = tickSpacing(pxPerSec);
    g.font = `11px ${theme.typography.fontFamily}`;
    g.textBaseline = 'top';
    for (const tick of ticks(scrollLeft / pxPerSec, (scrollLeft + width) / pxPerSec, pxPerSec)) {
      const x = Math.round(tick.time * pxPerSec - scrollLeft) + 0.5;
      g.fillStyle = tick.major ? theme.palette.text.secondary : theme.palette.divider;
      g.fillRect(x, tick.major ? 0 : height - 6, 1, tick.major ? height : 6);
      if (tick.major) {
        g.fillStyle = theme.palette.text.secondary;
        g.fillText(formatTimeLabel(tick.time, major), x + 4, 4);
      }
    }
  }, [theme, height]);

  useEffect(() => {
    draw();
    return subscribeView(draw);
  }, [draw]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: LOOP_STRIP_HEIGHT, height, pointerEvents: 'none' }} />;
}

/** Marker times with the one being dragged moved */
const withPreview = (loopState: LoopState, drag: Drag | null, pxPerSec: number) => {
  if (!drag || drag.hit.kind !== 'marker') return loopState.markers;
  const markerId = drag.hit.markerId;
  return loopState.markers.map((m) => (m.id === markerId ? { ...m, time: Math.max(0, drag.x / pxPerSec) } : m));
};

export default function TimeRuler({ width, pxPerSec, duration, playheadRef }: TimeRulerProps) {
  const theme = useTheme();
  const loopState = useAudioStore((s) => s.loopState);
  const isPlaying = useAudioStore((s) => s.playbackState.isPlaying);
  const [drag, setDrag] = useState<Drag | null>(null);
  const lastTap = useRef<{ time: number; x: number } | null>(null);

  const contentX = (e: React.PointerEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const x = contentX(e);
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const hit = hitTest(x, y < LOOP_STRIP_HEIGHT, loopState, pxPerSec);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ pointerId: e.pointerId, hit, downX: x, x });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    setDrag({ ...drag, x: contentX(e) });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const x = contentX(e);
    setDrag(null);
    const store = useAudioStore.getState();
    const action = resolveGesture(drag.hit, drag.downX, x, pxPerSec, duration);

    switch (action.type) {
      case 'seek': {
        // Double click / double tap on the ruler adds a marker
        const now = performance.now();
        const previous = lastTap.current;
        if (drag.hit.kind === 'empty' && previous && now - previous.time < DOUBLE_TAP_MS && Math.abs(previous.x - x) < 10) {
          store.addMarker(action.time);
          lastTap.current = null;
        } else {
          lastTap.current = { time: now, x };
          store.seek(action.time);
        }
        break;
      }
      case 'createLoop': {
        const startId = store.addMarker(action.start);
        const endId = store.addMarker(action.end);
        if (startId && endId) {
          const loopId = useAudioStore.getState().createLoop(startId, endId);
          if (loopId) useAudioStore.getState().setActiveLoop(loopId);
        }
        break;
      }
      case 'moveMarker':
        store.updateMarkerTime(action.markerId, action.time);
        break;
      case 'toggleLoop':
        store.toggleLoopById(action.loopId);
        break;
    }
  };

  const markers = withPreview(loopState, drag, pxPerSec);
  const markerTime = (id: string) => markers.find((m) => m.id === id)?.time;
  // Earliest marker of each loop (a marker may have been dragged past the other one)
  const loopStartIds = new Set(
    loopState.loops.map((l) => ((markerTime(l.startMarkerId) ?? 0) <= (markerTime(l.endMarkerId) ?? 0) ? l.startMarkerId : l.endMarkerId))
  );
  const newLoop =
    drag && drag.hit.kind !== 'marker' && Math.abs(drag.x - drag.downX) >= 4
      ? { left: Math.min(drag.x, drag.downX), width: Math.abs(drag.x - drag.downX) }
      : null;

  const hoverCursor = drag ? (drag.hit.kind === 'marker' ? 'ew-resize' : 'col-resize') : 'pointer';

  return (
    <Box
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      sx={{
        position: 'relative',
        width,
        height: RULER_HEIGHT,
        flexShrink: 0,
        cursor: hoverCursor,
        touchAction: 'none',
        userSelect: 'none',
        bgcolor: 'background.paper',
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Loop strip */}
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: LOOP_STRIP_HEIGHT, bgcolor: alpha(theme.palette.text.primary, 0.04) }} />

      {loopState.loops.map((loop) => {
        const a = markerTime(loop.startMarkerId);
        const b = markerTime(loop.endMarkerId);
        if (a === undefined || b === undefined) return null;
        const active = loop.id === loopState.activeLoopId && loop.enabled;
        const color = active ? theme.palette.primary.main : theme.palette.text.secondary;
        return (
          <Box
            key={loop.id}
            data-loop={loop.id}
            sx={{
              position: 'absolute',
              top: 2,
              height: LOOP_STRIP_HEIGHT - 4,
              left: Math.min(a, b) * pxPerSec,
              width: Math.abs(b - a) * pxPerSec,
              bgcolor: alpha(color, active ? 0.6 : 0.25),
              border: `1px solid ${alpha(color, active ? 1 : 0.5)}`,
              borderRadius: 0.5,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {newLoop && (
        <Box
          sx={{
            position: 'absolute',
            top: 2,
            height: LOOP_STRIP_HEIGHT - 4,
            left: newLoop.left,
            width: newLoop.width,
            bgcolor: alpha(theme.palette.primary.main, 0.35),
            border: `1px dashed ${theme.palette.primary.main}`,
            borderRadius: 0.5,
            pointerEvents: 'none',
          }}
        />
      )}

      <Graduation />

      {/* Marker flags (numbered in time order, like the markers panel) */}
      {markers.map((marker, index) => {
        // Loop starts get their flag on the left, so each loop reads as ( ... )
        const opensLoop = loopStartIds.has(marker.id);
        const inActiveLoop = loopState.loops.some(
          (l) => l.id === loopState.activeLoopId && l.enabled && (l.startMarkerId === marker.id || l.endMarkerId === marker.id)
        );
        const color = inActiveLoop && isPlaying ? theme.palette.primary.main : theme.palette.warning.main;
        return (
          <Box
            key={marker.id}
            data-marker={marker.id}
            sx={{ position: 'absolute', top: 0, bottom: 0, left: marker.time * pxPerSec - 1, width: 2, bgcolor: color, pointerEvents: 'none' }}
          >
            <Box
              sx={{
                position: 'absolute',
                // Same band as the loops, so flags and loop line up
                top: 2,
                ...(opensLoop ? { right: 2 } : { left: 2 }),
                px: 0.5,
                height: LOOP_STRIP_HEIGHT - 4,
                lineHeight: `${LOOP_STRIP_HEIGHT - 4}px`,
                fontSize: 10,
                fontWeight: 700,
                color: theme.palette.getContrastText(color),
                bgcolor: color,
                borderRadius: opensLoop ? '3px 0 0 3px' : '0 3px 3px 0',
              }}
            >
              {index + 1}
            </Box>
          </Box>
        );
      })}

      {/* Playhead (moved by the timeline animation loop) */}
      <Box
        ref={playheadRef}
        sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 0, pointerEvents: 'none', willChange: 'transform' }}
      >
        <Box sx={{ position: 'absolute', top: LOOP_STRIP_HEIGHT, bottom: 0, left: -1, width: 2, bgcolor: 'primary.light' }} />
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: -6,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: `8px solid ${theme.palette.primary.light}`,
            transform: 'translateY(-16px)',
          }}
        />
      </Box>
    </Box>
  );
}
