import { useEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import type { AudioTrack } from '../types/audio';
import { useAudioStore } from '../hooks/useAudioStore';

interface WaveformDisplayProps {
  track: AudioTrack;
  trackId: string;
}

const WaveformDisplay = ({ track }: WaveformDisplayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  // LOOP OVERLAY - DISABLED (kept for future re-enablement)
  // const loopOverlayRef = useRef<HTMLDivElement>(null);
  // const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null);
  // const [dragStartX, setDragStartX] = useState(0);
  // const [tempLoopRegion, setTempLoopRegion] = useState<{ start: number; end: number } | null>(null);

  const theme = useTheme();
  const { playbackState, seek } = useAudioStore();
  // const { playbackState, seek, loopRegion, setLoopRegion } = useAudioStore(); // For loop overlay

  // const displayLoopRegion = tempLoopRegion || loopRegion; // For loop overlay

  useEffect(() => {
    if (!containerRef.current || !track.buffer) return;

    const waveColor = track.isMuted ? theme.palette.action.disabled : track.color;
    // Make progress color more transparent/darker to show what's been played
    const progressColor = track.isMuted
      ? theme.palette.action.disabled
      : track.color + '80'; // Add 50% opacity (80 in hex = 128/255)

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      cursorColor: theme.palette.text.primary,
      cursorWidth: 2,
      barWidth: 5,
      barGap: 3,
      barRadius: 20,
      height: 60,
      normalize: true,
      interact: true,
    });

    wavesurferRef.current = wavesurfer;

    // Load directly from buffer
    wavesurfer.load('', [track.buffer.getChannelData(0)], track.buffer.duration);

    // Simple click handler - just seek, audio engine handles the rest
    wavesurfer.on('click', (progress) => {
      const time = progress * (track.buffer?.duration || 0);
      seek(time);
    });

    return () => {
      wavesurfer.destroy();
    };
  }, [track.buffer, track.color, track.isMuted, seek, theme]);

  // Update progress (throttled for performance)
  const lastUpdateTimeRef = useRef(0);
  useEffect(() => {
    if (wavesurferRef.current && track.buffer) {
      const now = Date.now();
      // Throttle to ~30fps max (but always update on buffer load)
      if (now - lastUpdateTimeRef.current > 33 || lastUpdateTimeRef.current === 0) {
        const progress = playbackState.currentTime / track.buffer.duration;
        wavesurferRef.current.seekTo(progress);
        lastUpdateTimeRef.current = now;
      }
    }
  }, [playbackState.currentTime, track.buffer]);

  // ========================================
  // LOOP OVERLAY DRAG HANDLERS - DISABLED
  // ========================================
  // Commented out for zoom feature implementation
  // To re-enable: uncomment this entire block + uncomment overlay JSX at bottom

  /*
  const handleLoopMouseDown = (e: React.MouseEvent | React.TouchEvent, type: 'start' | 'end' | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(type);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
  };

  useEffect(() => {
    if (!isDragging || !containerRef.current || !track.buffer) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current || !track.buffer) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const time = (x / rect.width) * track.buffer.duration;

      const currentRegion = tempLoopRegion || loopRegion;

      if (isDragging === 'start') {
        const newStart = Math.min(time, currentRegion.end - 0.1);
        setTempLoopRegion({ start: newStart, end: currentRegion.end });
      } else if (isDragging === 'end') {
        const newEnd = Math.max(time, currentRegion.start + 0.1);
        setTempLoopRegion({ start: currentRegion.start, end: newEnd });
      } else if (isDragging === 'move') {
        const delta = ((clientX - dragStartX) / rect.width) * track.buffer.duration;
        const duration = currentRegion.end - currentRegion.start;
        let newStart = currentRegion.start + delta;
        let newEnd = currentRegion.end + delta;

        if (newStart < 0) {
          newStart = 0;
          newEnd = duration;
        }
        if (newEnd > track.buffer.duration) {
          newEnd = track.buffer.duration;
          newStart = newEnd - duration;
        }

        setTempLoopRegion({ start: newStart, end: newEnd });
        setDragStartX(clientX);
      }
    };

    const handleEnd = () => {
      if (tempLoopRegion) {
        setLoopRegion(tempLoopRegion.start, tempLoopRegion.end);
        setTempLoopRegion(null);
      }
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragStartX, loopRegion, tempLoopRegion, track.buffer, setLoopRegion]);

  const getLoopPosition = () => {
    if (!track.buffer) return null;

    // Show loop overlay if defined, regardless of enabled state
    if (loopRegion.start >= loopRegion.end || loopRegion.end === 0) return null;

    const startPercent = (displayLoopRegion.start / track.buffer.duration) * 100;
    const endPercent = (displayLoopRegion.end / track.buffer.duration) * 100;

    return {
      left: `${startPercent}%`,
      width: `${endPercent - startPercent}%`,
    };
  };

  const loopPos = getLoopPosition();
  */
  // END OF COMMENTED LOOP OVERLAY CODE

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: 60,
        bgcolor: 'background.paper',
        borderRadius: 1,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* ========================================
          LOOP OVERLAY - DISABLED FOR ZOOM FEATURE
          ========================================

          Loop overlays on individual tracks are disabled to allow proper zoom implementation.
          Loop region is only shown on the PhantomTimeline (dedicated loop panel).

          To re-enable: uncomment the code block below
      */}

      {/* Loop region overlay - COMMENTED OUT */}
      {/* {loopPos && (
        <>
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: loopPos.left,
              width: loopPos.width,
              height: '100%',
              bgcolor: 'primary.main',
              opacity: loopRegion.enabled ? 0.15 : 0.05,
              borderRadius: 1,
              cursor: isDragging ? 'grabbing' : 'grab',
              zIndex: 10,
              pointerEvents: 'auto',
              touchAction: 'none',
              transition: 'opacity 0.2s',
              '&:hover': {
                opacity: loopRegion.enabled ? 0.25 : 0.1,
              },
            }}
            onMouseDown={(e) => handleLoopMouseDown(e, 'move')}
            onTouchStart={(e) => handleLoopMouseDown(e, 'move')}
          />

          <Box
            ref={loopOverlayRef}
            sx={{
              position: 'absolute',
              top: 0,
              left: loopPos.left,
              width: loopPos.width,
              height: '100%',
              border: '2px solid',
              borderColor: 'primary.main',
              borderRadius: 1,
              pointerEvents: 'none',
              zIndex: 11,
              opacity: loopRegion.enabled ? 1 : 0.3,
              transition: 'opacity 0.2s',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: -10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                cursor: 'ew-resize',
                boxShadow: 1,
                opacity: loopRegion.enabled ? 1 : 0.3,
                transition: 'all 0.2s',
                pointerEvents: 'auto',
                touchAction: 'none',
                '&:hover': {
                  transform: 'translateY(-50%) scale(1.2)',
                  boxShadow: 2,
                },
              }}
              onMouseDown={(e) => handleLoopMouseDown(e, 'start')}
              onTouchStart={(e) => handleLoopMouseDown(e, 'start')}
            />

            <Box
              sx={{
                position: 'absolute',
                right: -10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                cursor: 'ew-resize',
                boxShadow: 1,
                opacity: loopRegion.enabled ? 1 : 0.3,
                transition: 'all 0.2s',
                pointerEvents: 'auto',
                touchAction: 'none',
                '&:hover': {
                  transform: 'translateY(-50%) scale(1.2)',
                  boxShadow: 2,
                },
              }}
              onMouseDown={(e) => handleLoopMouseDown(e, 'end')}
              onTouchStart={(e) => handleLoopMouseDown(e, 'end')}
            />
          </Box>
        </>
      )} */}
    </Box>
  );
};

export default WaveformDisplay;
