import { useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import { useAudioStore } from '../hooks/useAudioStore';

const PhantomTimeline = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'move' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [tempLoopRegion, setTempLoopRegion] = useState<{ start: number; end: number } | null>(null);
  
  const theme = useTheme();
  const { playbackState, seek, loopRegion, setLoopRegion } = useAudioStore();

  // Use temp loop region during drag, otherwise use store value
  const displayLoopRegion = tempLoopRegion || loopRegion;

  // Create wavesurfer instance
  useEffect(() => {
    if (!containerRef.current || playbackState.duration === 0) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'transparent',
      progressColor: 'transparent',
      cursorColor: theme.palette.text.primary,
      cursorWidth: 2,
      barWidth: 0,
      height: 60,
      normalize: true,
      interact: true,
    });

    wavesurferRef.current = wavesurfer;

    // Create empty buffer with duration of longest track
    const emptyBuffer = new AudioBuffer({
      length: Math.ceil(playbackState.duration * 44100),
      sampleRate: 44100,
      numberOfChannels: 1,
    });

    wavesurfer.load('', [emptyBuffer.getChannelData(0)], emptyBuffer.duration);

    // Handle clicks to seek (only if not dragging)
    wavesurfer.on('click', (progress) => {
      if (!isDragging) {
        const time = progress * playbackState.duration;
        seek(time);
      }
    });

    return () => {
      wavesurfer.destroy();
    };
  }, [playbackState.duration, seek, theme, isDragging]);

  // Update cursor position
  const lastUpdateTimeRef = useRef(0);
  useEffect(() => {
    if (wavesurferRef.current && playbackState.duration > 0) {
      const now = Date.now();
      // Throttle to ~30fps max (but always update on duration change = buffer loaded)
      if (now - lastUpdateTimeRef.current > 33 || lastUpdateTimeRef.current === 0) {
        const progress = playbackState.currentTime / playbackState.duration;
        wavesurferRef.current.seekTo(progress);
        lastUpdateTimeRef.current = now;
      }
    }
  }, [playbackState.currentTime, playbackState.duration]);

  // Handle loop overlay drag
  const handleLoopMouseDown = (e: React.MouseEvent | React.TouchEvent, type: 'start' | 'end' | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(type);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
  };

  useEffect(() => {
    if (!isDragging || !containerRef.current || playbackState.duration === 0) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current || playbackState.duration === 0) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const time = (x / rect.width) * playbackState.duration;

      const currentRegion = tempLoopRegion || loopRegion;

      if (isDragging === 'start') {
        const newStart = Math.min(time, currentRegion.end - 0.1);
        setTempLoopRegion({ start: newStart, end: currentRegion.end });
      } else if (isDragging === 'end') {
        const newEnd = Math.max(time, currentRegion.start + 0.1);
        setTempLoopRegion({ start: currentRegion.start, end: newEnd });
      } else if (isDragging === 'move') {
        const delta = ((clientX - dragStartX) / rect.width) * playbackState.duration;
        const duration = currentRegion.end - currentRegion.start;
        let newStart = currentRegion.start + delta;
        let newEnd = currentRegion.end + delta;
        
        if (newStart < 0) {
          newStart = 0;
          newEnd = duration;
        }
        if (newEnd > playbackState.duration) {
          newEnd = playbackState.duration;
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
  }, [isDragging, dragStartX, loopRegion, tempLoopRegion, playbackState.duration, setLoopRegion]);

  const getLoopPosition = () => {
    if (playbackState.duration === 0) return null;
    // Show loop overlay if defined, regardless of enabled state
    if (loopRegion.start >= loopRegion.end || loopRegion.end === 0) return null;
    
    const startPercent = (displayLoopRegion.start / playbackState.duration) * 100;
    const endPercent = (displayLoopRegion.end / playbackState.duration) * 100;
    
    return {
      left: `${startPercent}%`,
      width: `${endPercent - startPercent}%`,
    };
  };

  const loopPos = getLoopPosition();
  
  // Calculate cursor position for visual line gradient
  const cursorPercent = playbackState.duration > 0 
    ? (playbackState.currentTime / playbackState.duration) * 100 
    : 0;

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: 60,
        bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
        borderRadius: 1,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Horizontal line to simulate waveform */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: 0,
          width: '100%',
          height: 2,
          background: `linear-gradient(to right, 
            ${theme.palette.primary.main}40 0%, 
            ${theme.palette.primary.main}40 ${cursorPercent}%, 
            ${theme.palette.primary.main} ${cursorPercent}%, 
            ${theme.palette.primary.main} 100%)`,
          transform: 'translateY(-50%)',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      />
      
      {/* Loop region overlay - always visible if defined, but with opacity */}
      {loopPos && (
        <>
          {/* Background overlay with transparency */}
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
          
          {/* Border overlay */}
          <Box
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
            {/* Start handle */}
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
            
            {/* End handle */}
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
      )}
    </Box>
  );
};

export default PhantomTimeline;
