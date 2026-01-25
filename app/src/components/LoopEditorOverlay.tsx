import { useEffect, useRef, useState, memo } from 'react';
import { Box } from '@mui/material';
import { useAudioStore } from '../hooks/useAudioStore';
import MarkerLine from './MarkerLine';
import LoopZone from './LoopZone';
import {logger} from '../utils/logger';

interface LoopEditorOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const LoopEditorOverlay = ({ containerRef }: LoopEditorOverlayProps) => {
  const {
    loopState,
    playbackState,
    addMarker,
    createLoop,
    toggleLoopById,
    seek,
  } = useAudioStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Get container dimensions, scroll offset, and waveform width (zoom)
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [waveformWidth, setWaveformWidth] = useState(0);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [containerRef]);

  // Sync scroll position and waveform width from WaveSurfer Shadow DOM
  useEffect(() => {
    const syncScroll = () => {
      if (!containerRef.current) return;

      // Find the waveform element with Shadow DOM
      const waveformWrapper = containerRef.current.querySelector('[data-wavesurfer]');
      if (!waveformWrapper) return;

      const firstChild = waveformWrapper.firstElementChild;
      if (!firstChild || !firstChild.shadowRoot) return;

      const scrollElement = firstChild.shadowRoot.querySelector('.scroll') as HTMLElement;
      if (!scrollElement) return;

      // Update scroll offset and waveform width
      setScrollLeft(scrollElement.scrollLeft);
      setWaveformWidth(scrollElement.scrollWidth);
    };

    // Initial sync
    syncScroll();

    // Listen for scroll events in Shadow DOM
    const waveformWrapper = containerRef.current?.querySelector('[data-wavesurfer]');
    if (!waveformWrapper) return;

    const firstChild = waveformWrapper.firstElementChild;
    if (!firstChild || !firstChild.shadowRoot) return;

    const scrollElement = firstChild.shadowRoot.querySelector('.scroll') as HTMLElement;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', syncScroll, { passive: true });

    // Also listen for zoom changes - observe the scroll element size
    const resizeObserver = new ResizeObserver(() => {
      syncScroll();
    });
    resizeObserver.observe(scrollElement);

    return () => {
      scrollElement.removeEventListener('scroll', syncScroll);
      resizeObserver.disconnect();
    };
  }, [containerRef, containerWidth]); // Re-run when container changes

  // Helper: Convert pixel position to time (accounting for scroll and zoom)
  const pixelToTime = (clientX: number): number => {
    if (!overlayRef.current || playbackState.duration === 0) return 0;
    
    const rect = overlayRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left + scrollLeft; // Add scrollLeft to account for scroll offset
    
    // Convert to percentage of waveform width, then to time
    const percent = waveformWidth > 0 ? (relativeX / waveformWidth) * 100 : 0;
    return (percent / 100) * playbackState.duration;
  };

  // Handle clicks and drags
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!loopState.editMode) return;
    if (!overlayRef.current) return;

    const time = pixelToTime(e.clientX);

    logger.debug(`🖱️ Mouse down at ${time.toFixed(2)}s`);

    setDragStart(time);
    setDragCurrent(time);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStart === null) return;
    if (!overlayRef.current) return;

    const time = pixelToTime(e.clientX);

    setDragCurrent(time);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging || dragStart === null) return;

    const endTime = pixelToTime(e.clientX);

    const distance = Math.abs(endTime - dragStart);

    logger.debug(`🖱️ Mouse up: distance = ${distance.toFixed(2)}s`);

    // If very small drag (< 0.5s), create single marker
    if (distance < 0.5) {
      logger.debug('📍 Creating single marker');
      addMarker(dragStart);
    } else {
      // Create 2 markers and a loop
      const [start, end] = dragStart < endTime 
        ? [dragStart, endTime]
        : [endTime, dragStart];

      logger.debug(`🔁 Creating loop from ${start.toFixed(2)}s to ${end.toFixed(2)}s`);

      const startMarkerId = addMarker(start);
      const endMarkerId = addMarker(end);

      if (startMarkerId && endMarkerId) {
        createLoop(startMarkerId, endMarkerId);
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  // Handle marker click (seek to position)
  const handleMarkerClick = (id: string) => {
    const marker = loopState.markers.find(m => m.id === id);
    if (marker && !loopState.editMode) {
      logger.debug(`📍 Seeking to marker at ${marker.time.toFixed(2)}s`);
      seek(marker.time);
    }
  };

  // Handle loop click (toggle enable/disable)
  const handleLoopClick = (id: string) => {
    if (!loopState.editMode) {
      logger.debug(`🔁 Toggling loop ${id}`);
      toggleLoopById(id);
    }
  };

  if (!containerWidth || playbackState.duration === 0) {
    return null;
  }

  // Calculate preview zone during drag
  const previewZone = isDragging && dragStart !== null && dragCurrent !== null ? {
    start: Math.min(dragStart, dragCurrent),
    end: Math.max(dragStart, dragCurrent),
  } : null;

  return (
    <Box
      ref={overlayRef}
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: loopState.editMode ? 'auto' : 'none',
        cursor: loopState.editMode ? 'crosshair' : 'default',
        zIndex: 100,
        overflow: 'hidden', // Important: clip content outside
      }}
    >
      {/* Inner container that moves with scroll and scales with zoom */}
      <Box
        sx={{
          position: 'relative',
          width: waveformWidth > 0 ? `${waveformWidth}px` : '100%',
          height: '100%',
          transform: `translateX(-${scrollLeft}px)`,
          transition: 'none', // No transition for scroll sync
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Render all loops */}
        {loopState.loops.map(loop => {
        const startMarker = loopState.markers.find(m => m.id === loop.startMarkerId);
        const endMarker = loopState.markers.find(m => m.id === loop.endMarkerId);

        if (!startMarker || !endMarker) return null;

        const startIndex = loopState.markers.indexOf(startMarker);
        const endIndex = loopState.markers.indexOf(endMarker);

        return (
          <LoopZone
            key={loop.id}
            loop={loop}
            startMarker={startMarker}
            endMarker={endMarker}
            startMarkerIndex={startIndex}
            endMarkerIndex={endIndex}
            duration={playbackState.duration}
            onClick={handleLoopClick}
          />
        );
      })}

      {/* Render all markers */}
      {loopState.markers.map((marker, index) => {
        const isInActiveLoop = loopState.activeLoopId
          ? loopState.loops.find(l => 
              l.id === loopState.activeLoopId && 
              (l.startMarkerId === marker.id || l.endMarkerId === marker.id)
            ) !== undefined
          : false;

        return (
          <MarkerLine
            key={marker.id}
            marker={marker}
            index={index}
            duration={playbackState.duration}
            isInActiveLoop={isInActiveLoop}
            onClick={handleMarkerClick}
          />
        );
      })}

      {/* Preview zone during drag */}
      {previewZone && (
        <Box
          sx={{
            position: 'absolute',
            left: `${(previewZone.start / playbackState.duration) * 100}%`,
            width: `${((previewZone.end - previewZone.start) / playbackState.duration) * 100}%`,
            top: 0,
            bottom: 0,
            bgcolor: 'rgba(25, 118, 210, 0.15)',
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
      )}
      </Box>
    </Box>
  );
};

export default memo(LoopEditorOverlay);
