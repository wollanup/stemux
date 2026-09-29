/**
 * Arrangement view: ONE scroll container, ONE time scale, ONE playhead.
 *
 * - Large screens: track headers in a sticky left column.
 * - Mobile / portrait: each header above its lane (sticky while scrolling).
 * The ruler is sticky on top, so nothing needs to be kept in sync.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { alpha, Box, useMediaQuery, useTheme } from '@mui/material';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useAudioStore } from '../hooks/useAudioStore';
import { audioEngine } from '../audio/AudioEngine';
import TrackAdder from '../components/TrackAdder';
import TimeRuler from './TimeRuler';
import TrackRow from './TrackRow';
import { clampScroll, contentWidth as computeContentWidth, followScroll, pxPerSecond, scrollForAnchor } from './timelineMath';
import { getView, setView, setZoomAnchor, takeZoomAnchor } from './viewStore';
import { zoomBy } from './zoomActions';
import { clampHeaderWidth, HEADER_WIDTH_DEFAULT, loadHeaderWidth, RULER_HEIGHT, saveHeaderWidth } from './layout';
import ResizeHandle from './ResizeHandle';
import { useTranslation } from 'react-i18next';
import { MAX_ZOOM } from './zoom';

/** No automatic follow for a while after the user scrolled by hand */
const MANUAL_SCROLL_GRACE_MS = 3000;

export default function Timeline() {
  const theme = useTheme();
  const { t } = useTranslation();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  // Header column width: resizable, remembered in this browser
  const [savedHeaderWidth, setSavedHeaderWidth] = useState(loadHeaderWidth);
  const [dragHeaderWidth, setDragHeaderWidth] = useState<number | null>(null);
  const dragHeaderWidthRef = useRef<number | null>(null);
  const columnWidth = dragHeaderWidth ?? savedHeaderWidth;
  const headerWidth = wide ? columnWidth : 0;
  const headerResize = useMemo(
    () => ({
      onResize: (delta: number) => {
        dragHeaderWidthRef.current = clampHeaderWidth(savedHeaderWidth + delta);
        setDragHeaderWidth(dragHeaderWidthRef.current);
      },
      onEnd: () => {
        const width = dragHeaderWidthRef.current;
        dragHeaderWidthRef.current = null;
        setDragHeaderWidth(null);
        if (width !== null) {
          setSavedHeaderWidth(width);
          saveHeaderWidth(width);
        }
      },
      onReset: () => {
        setSavedHeaderWidth(HEADER_WIDTH_DEFAULT);
        saveHeaderWidth(null);
      },
    }),
    [savedHeaderWidth]
  );

  const tracks = useAudioStore((s) => s.tracks);
  const duration = useAudioStore((s) => s.playbackState.duration);
  const zoomLevel = useAudioStore((s) => s.zoomLevel);
  const loopState = useAudioStore((s) => s.loopState);
  const reorderTracks = useAudioStore((s) => s.reorderTracks);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerPlayheadRef = useRef<HTMLDivElement>(null);
  const lanePlayheadRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);
  const lastManualScroll = useRef(0);

  // Width of the whole container, measured
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewportWidth = Math.max(0, containerWidth - headerWidth);
  const pps = pxPerSecond(zoomLevel, viewportWidth, duration);
  const width = computeContentWidth(duration, pps, viewportWidth);

  const setScroll = useCallback((scrollLeft: number) => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(el.scrollLeft - scrollLeft) >= 0.5) {
      programmaticScroll.current = true;
      el.scrollLeft = scrollLeft;
    }
    setView({ scrollLeft: el.scrollLeft });
  }, []);

  // Apply a new scale, keeping the zoom anchor in place
  useLayoutEffect(() => {
    const previous = getView();
    if (previous.pxPerSec === pps && previous.viewportWidth === viewportWidth) return;

    let anchor = takeZoomAnchor();
    if (!anchor) {
      // Keep the playhead in place when visible, otherwise the left edge
      const time = audioEngine.getCurrentTime();
      const x = time * previous.pxPerSec - previous.scrollLeft;
      anchor = x >= 0 && x <= previous.viewportWidth
        ? { time, viewportX: x }
        : { time: previous.scrollLeft / previous.pxPerSec, viewportX: 0 };
    }
    setView({ pxPerSec: pps, viewportWidth });
    setScroll(clampScroll(scrollForAnchor(anchor.time, anchor.viewportX, pps), width, viewportWidth));
  }, [pps, viewportWidth, width, setScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (programmaticScroll.current) {
      programmaticScroll.current = false;
    } else if (Math.abs(el.scrollLeft - getView().scrollLeft) > 0.5) {
      lastManualScroll.current = performance.now();
    }
    setView({ scrollLeft: el.scrollLeft });
  };

  // Playhead, played area and "follow playhead", every frame
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { pxPerSec, scrollLeft, viewportWidth: vw } = getView();
      const time = audioEngine.getCurrentTime();
      const x = time * pxPerSec;
      const transform = `translateX(${x}px)`;
      if (rulerPlayheadRef.current) rulerPlayheadRef.current.style.transform = transform;
      if (lanePlayheadRef.current) lanePlayheadRef.current.style.transform = transform;
      if (playedRef.current) playedRef.current.style.width = `${x}px`;

      if (audioEngine.isPlaying() && performance.now() - lastManualScroll.current > MANUAL_SCROLL_GRACE_MS) {
        const next = followScroll(time, scrollLeft, vw, pxPerSec);
        if (next !== null) setScroll(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [setScroll]);

  // Ctrl + wheel: zoom around the mouse. Pinch: zoom around the fingers.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const viewportXOf = (clientX: number) => clientX - el.getBoundingClientRect().left - headerWidth;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { pxPerSec, scrollLeft } = getView();
      const viewportX = viewportXOf(e.clientX);
      zoomBy(e.deltaY < 0 ? 1 : -1, { time: (scrollLeft + viewportX) / pxPerSec, viewportX });
    };

    let pinch: { distance: number; pps: number; time: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
    const centerX = (t: TouchList) => viewportXOf((t[0].clientX + t[1].clientX) / 2);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const { pxPerSec, scrollLeft } = getView();
      pinch = { distance: distance(e.touches), pps: pxPerSec, time: (scrollLeft + centerX(e.touches)) / pxPerSec };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const { viewportWidth: vw } = getView();
      const fit = pxPerSecond(0, vw, useAudioStore.getState().playbackState.duration);
      const target = (pinch.pps * distance(e.touches)) / pinch.distance;
      setZoomAnchor({ time: pinch.time, viewportX: centerX(e.touches) });
      useAudioStore.setState({ zoomLevel: target <= fit * 1.01 ? 0 : Math.min(MAX_ZOOM, target) });
    };
    const onTouchEnd = () => {
      pinch = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [headerWidth]);

  // Track reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      reorderTracks(
        tracks.findIndex((t) => t.id === active.id),
        tracks.findIndex((t) => t.id === over.id)
      );
    }
  };

  const hasSolo = tracks.some((t) => t.isSolo);

  // Active loop and markers, drawn across all lanes
  const activeLoop = loopState.loops.find((l) => l.id === loopState.activeLoopId && l.enabled);
  const loopStart = activeLoop && loopState.markers.find((m) => m.id === activeLoop.startMarkerId)?.time;
  const loopEnd = activeLoop && loopState.markers.find((m) => m.id === activeLoop.endMarkerId)?.time;

  return (
    <Box
      ref={scrollRef}
      onScroll={onScroll}
      data-timeline-scroll
      data-px-per-sec={pps}
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        position: 'relative',
        touchAction: 'pan-x pan-y',
        overscrollBehavior: 'contain',
        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.02 : 0.03),
      }}
    >
      <Box sx={{ position: 'relative', width: headerWidth + width, minWidth: '100%' }}>
        {/* Ruler row */}
        <Box sx={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', height: RULER_HEIGHT }}>
          {wide && (
            <Box
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 6,
                width: headerWidth,
                flexShrink: 0,
                bgcolor: 'background.paper',
                borderRight: `1px solid ${theme.palette.divider}`,
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <ResizeHandle axis="x" label={t('track.resizeHeaders')} {...headerResize} />
            </Box>
          )}
          <TimeRuler width={width} pxPerSec={pps} duration={duration} playheadRef={rulerPlayheadRef} />
        </Box>

        {/* Lanes */}
        <Box sx={{ position: 'relative' }}>
          {/* Overlay across all lanes: played area, active loop, markers, playhead */}
          <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: headerWidth, width, zIndex: 2, pointerEvents: 'none', overflow: 'hidden' }}>
            <Box ref={playedRef} sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, bgcolor: alpha(theme.palette.background.default, 0.35) }} />
            {loopStart !== undefined && loopEnd !== undefined && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: Math.min(loopStart, loopEnd) * pps,
                  width: Math.abs(loopEnd - loopStart) * pps,
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  borderLeft: `1px solid ${alpha(theme.palette.primary.main, 0.6)}`,
                  borderRight: `1px solid ${alpha(theme.palette.primary.main, 0.6)}`,
                }}
              />
            )}
            {loopState.markers.map((m) => (
              <Box key={m.id} sx={{ position: 'absolute', top: 0, bottom: 0, left: m.time * pps, width: '1px', bgcolor: alpha(theme.palette.warning.main, 0.35) }} />
            ))}
            <Box ref={lanePlayheadRef} sx={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, bgcolor: 'primary.light', willChange: 'transform' }} />
          </Box>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  wide={wide}
                  headerWidth={headerWidth}
                  headerResize={headerResize}
                  contentWidth={width}
                  viewportWidth={containerWidth}
                  pxPerSec={pps}
                  dimmed={track.isMuted || (hasSolo && !track.isSolo)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </Box>

        {/* Add tracks, always visible whatever the horizontal scroll */}
        <Box sx={{ position: 'sticky', left: 0, width: containerWidth || '100%', py: 3 }}>
          <TrackAdder />
        </Box>
      </Box>
    </Box>
  );
}
