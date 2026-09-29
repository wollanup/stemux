/**
 * Horizontal scrollbar of the lanes, replacing the native one: right below
 * the last track, or stuck to the bottom of the timeline (above the play
 * button) when the tracks do not fit.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { alpha, Box } from '@mui/material';
import { useTimelineView } from './viewStore';
import { SCROLLBAR_BOTTOM_GAP, SCROLLBAR_HEIGHT } from './layout';
import { scrollbarColors } from './scrollbarColors';

const MIN_THUMB = 32;

interface TimelineScrollbarProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  headerWidth: number;
  containerWidth: number;
  contentWidth: number;
}

export default function TimelineScrollbar({ scrollRef, headerWidth, containerWidth, contentWidth }: TimelineScrollbarProps) {
  const { scrollLeft, viewportWidth } = useTimelineView();
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; scrollLeft: number } | null>(null);

  const trackWidth = Math.max(0, containerWidth - headerWidth);
  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const thumbWidth = contentWidth > 0 ? Math.min(trackWidth, Math.max(MIN_THUMB, (trackWidth * viewportWidth) / contentWidth)) : trackWidth;
  const travel = Math.max(1, trackWidth - thumbWidth);
  const thumbLeft = maxScroll > 0 ? (Math.min(scrollLeft, maxScroll) / maxScroll) * travel : 0;
  const visible = maxScroll > 0.5;

  // Vertical wheel over the scrollbar scrolls horizontally
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el || e.ctrlKey) return;
      e.preventDefault();
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    };
    track.addEventListener('wheel', onWheel, { passive: false });
    return () => track.removeEventListener('wheel', onWheel);
  }, [scrollRef, visible]);

  if (!visible) return null;

  const scrollTo = (value: number) => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, Math.min(maxScroll, value));
  };

  return (
    <Box
      sx={{
        position: 'sticky',
        left: 0,
        bottom: SCROLLBAR_BOTTOM_GAP,
        zIndex: 4,
        width: containerWidth,
        height: SCROLLBAR_HEIGHT,
        pl: `${headerWidth}px`,
        boxSizing: 'border-box',
      }}
    >
      <Box
        ref={trackRef}
        data-timeline-scrollbar
        role="scrollbar"
        aria-orientation="horizontal"
        aria-controls="timeline-scroll"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScroll)}
        aria-valuenow={Math.round(scrollLeft)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          let start = scrollLeft;
          // Outside the thumb: jump so that the thumb is centered on the pointer
          if (x < thumbLeft || x > thumbLeft + thumbWidth) {
            start = ((x - thumbWidth / 2) / travel) * maxScroll;
            scrollTo(start);
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { pointerId: e.pointerId, x: e.clientX, scrollLeft: Math.max(0, Math.min(maxScroll, start)) };
        }}
        onPointerMove={(e) => {
          if (drag.current?.pointerId !== e.pointerId) return;
          scrollTo(drag.current.scrollLeft + ((e.clientX - drag.current.x) / travel) * maxScroll);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        sx={(theme) => {
          const colors = scrollbarColors(theme);
          return {
            position: 'relative',
            height: '100%',
            bgcolor: colors.track,
            borderTop: `1px solid ${theme.palette.divider}`,
            borderBottom: `1px solid ${theme.palette.divider}`,
            boxSizing: 'border-box',
            touchAction: 'none',
            cursor: 'pointer',
            '&:hover [data-thumb]': { bgcolor: colors.thumbHover },
            '&:active [data-thumb]': { bgcolor: alpha(theme.palette.primary.main, 0.7) },
          };
        }}
      >
        <Box
          data-thumb
          sx={(theme) => ({
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: thumbLeft,
            width: thumbWidth,
            borderRadius: SCROLLBAR_HEIGHT / 2,
            bgcolor: scrollbarColors(theme).thumb,
            transition: 'background-color 0.15s',
          })}
        />
      </Box>
    </Box>
  );
}
