import {memo, useEffect, useRef, useState} from 'react';
import {Box, useTheme} from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import type { WaveSurferOptions } from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import Minimap from 'wavesurfer.js/dist/plugins/minimap.esm.js';
import type {AudioTrack} from '../types/audio';
import {markTrackFinished, registerWavesurfer, unregisterWavesurfer, useAudioStore} from '../hooks/useAudioStore';
import {setPlaybackTime} from '../hooks/usePlaybackTime';
import {getWaveSurferElement, injectMarkersAndLoops, setupEditModeInteractions} from '../utils/shadowDomLoopRenderer';
import {logger} from '../utils/logger';

interface WaveformDisplayProps {
  track: AudioTrack;
  trackId: string;
}

const WaveformDisplay = ({ track }: WaveformDisplayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isDraggingRef = useRef(false);
  const lastZoomRef = useRef(0);
  const zoomRafRef = useRef<number | null>(null);

  const theme = useTheme();
  const {
    seek,
    zoomLevel,
    playbackState,
    masterVolume,
    waveformStyle,
    waveformNormalize,
    waveformTimeline,
    waveformMinimap,
    loopState,
  } = useAudioStore();

  // Use ref to avoid recreating WaveSurfer when seek changes
  const seekRef = useRef(seek);
  useEffect(() => {
    seekRef.current = seek;
  }, [seek]);

  useEffect(() => {
    if (!containerRef.current || !track.file) return;

    const waveColor = track.color;
    const progressColor = track.color + '80'; // Add 50% opacity

    // Create plugins array
    const plugins = [];
    
    // Add timeline if enabled
    if (waveformTimeline) {
      plugins.push(TimelinePlugin.create());
    }
    
    // Add minimap if enabled
    let minimapInstance = null;
    if (waveformMinimap) {
      minimapInstance = Minimap.create({
        height: 20,
        waveColor: theme.palette.grey[400],
        progressColor: theme.palette.grey[600],
      });
      plugins.push(minimapInstance);
    }

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      cursorColor: theme.palette.primary.light,
      cursorWidth: 4,
      ...(waveformStyle === 'modern' ? {
        barWidth: 5,
        barGap: 3,
        barRadius: 20,
      } : {}),
      height: 60,
      normalize: waveformNormalize,
      interact: true,
      autoScroll: true,
      autoCenter: true,
      dragToSeek: false, // Disable built-in to avoid double-seek
      // hideScrollbar: true,
      plugins,
    });

    wavesurferRef.current = wavesurfer;

    // Register this instance
    registerWavesurfer(track.id, wavesurfer);


    // Load audio directly from file - NO CONVERSION!
    wavesurfer.loadBlob(track.file);

    // Update playback position during playback (throttled for performance)
    let lastTimeUpdate = 0;
    wavesurfer.on('timeupdate', (currentTime) => {
      const now = Date.now();
      // Throttle to 50fps (20ms)
      if (now - lastTimeUpdate > 20) {
        // Update lightweight time tracker (doesn't trigger Zustand store re-renders!)
        setPlaybackTime(currentTime);

        // Check Loop v2 first
        const { loopState } = useAudioStore.getState();

        if (loopState.activeLoopId) {
          const activeLoop = loopState.loops.find(l => l.id === loopState.activeLoopId);

          if (activeLoop && activeLoop.enabled) {
            const startMarker = loopState.markers.find(m => m.id === activeLoop.startMarkerId);
            const endMarker = loopState.markers.find(m => m.id === activeLoop.endMarkerId);

            if (startMarker && endMarker && currentTime >= endMarker.time) {
              logger.debug(`🔁 Loop v2 end reached (${endMarker.time.toFixed(2)}s), seeking back to ${startMarker.time.toFixed(2)}s`);
              seekRef.current(startMarker.time);
            }
          }
        } else {
          // Fallback to old loop system
          const { loopRegion } = useAudioStore.getState();
          if (loopRegion.enabled && loopRegion.start < loopRegion.end && currentTime >= loopRegion.end) {
            logger.debug('🔁 Loop end reached, seeking back to:', loopRegion.start);
            seekRef.current(loopRegion.start);
          }
        }

        lastTimeUpdate = now;
      }
    });

    // Detect when playback finishes
    wavesurfer.on('finish', () => {
      logger.debug('🏁 Playback finished for track:', track.id);
      markTrackFinished(track.id);
    });

    // Mark as ready when waveform is loaded
    wavesurfer.on('ready', () => {
      setIsReady(true);

      // Update global duration if this track is longer
      const duration = wavesurfer.getDuration();
      const currentDuration = useAudioStore.getState().playbackState.duration;
      if (duration > currentDuration) {
        useAudioStore.setState((state) => ({
          playbackState: {
            ...state.playbackState,
            duration,
          },
        }));
      }

      // Find Shadow DOM and inject markers/loops
      const wsElement = getWaveSurferElement(containerRef);
      
      if (wsElement && wsElement.shadowRoot) {
        const wrapper = wsElement.shadowRoot.querySelector('.wrapper') as HTMLElement;
        
        if (wrapper) {
          // Inject markers and loops using external module
          injectMarkersAndLoops(wsElement, loopState, playbackState, theme);

          // Add interaction layer for edit mode using external module
          setupEditModeInteractions(wrapper, wsElement, loopState, playbackState, isDraggingRef, theme);
        }
      }

      // Set initial state from track data
      const allTracks = useAudioStore.getState().tracks;
      const hasSoloedTracks = allTracks.some(t => t.isSolo);
      const shouldBeMuted = track.isMuted || (hasSoloedTracks && !track.isSolo);

      wavesurfer.setMuted(shouldBeMuted);
      wavesurfer.setVolume(track.volume * useAudioStore.getState().masterVolume);
      wavesurfer.setPlaybackRate(useAudioStore.getState().playbackState.playbackRate, true);

      // Restore zoom level from store
      const currentZoom = useAudioStore.getState().zoomLevel;
      if (currentZoom > 0) {
        wavesurfer.zoom(currentZoom);
        lastZoomRef.current = currentZoom;
      }

      // Restore playback position
      const currentTime = useAudioStore.getState().playbackState.currentTime;
      if (currentTime > 0) {
        wavesurfer.setTime(currentTime);
      }
    });

    // Simple click handler - seek only if not in loop edit mode
    wavesurfer.on('click', (progress) => {
      const { loopState, setActiveLoop } = useAudioStore.getState();
      
      // Don't seek if in edit mode (handled by LoopEditorOverlay)
      if (loopState.editMode) {
        logger.debug('🚫 Click ignored (edit mode active)');
        return;
      }

      // Clicking on waveform always disables any active loop
      if (loopState.activeLoopId) {
        logger.debug('🔓 Disabling loop on waveform click');
        setActiveLoop(null);
      }

      const duration = wavesurfer.getDuration();
      const time = progress * duration;
      seekRef.current(time); // Use ref to avoid dependency
    });

    // Sync minimap clicks to other tracks
    if (minimapInstance) {
      minimapInstance.on('click', () => {
        const { loopState, setActiveLoop } = useAudioStore.getState();
        
        // The minimap already updated its own track automatically
        // We just need to sync to OTHER tracks
        const newTime = wavesurfer.getCurrentTime();
        
        // Disable active loop when seeking
        if (loopState.activeLoopId) {
          setActiveLoop(null);
        }
        
        // Sync all tracks (including this one, but it's already at the right position)
        seek(newTime);
      });
    }

    // Pinch-to-zoom on mobile
    let initialPinchDistance: number | null = null;
    let initialZoomLevel: number | null = null;

    const getTouchDistance = (touch1: Touch, touch2: Touch) => {
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
        initialZoomLevel = useAudioStore.getState().zoomLevel;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistance && initialZoomLevel !== null) {
        e.preventDefault(); // Prevent browser zoom
        
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialPinchDistance;
        
        // Calculate new zoom level (scale from initial)
        const newZoom = Math.max(0, Math.min(500, initialZoomLevel * scale));
        
        useAudioStore.setState({ zoomLevel: newZoom });
      }
    };

    const handleTouchEnd = () => {
      initialPinchDistance = null;
      initialZoomLevel = null;
    };

    const scrollElement = wavesurfer.getWrapper().shadowRoot?.querySelector('.scroll') as HTMLElement;
    if (scrollElement) {
      scrollElement.addEventListener('touchstart', handleTouchStart, { passive: false });
      scrollElement.addEventListener('touchmove', handleTouchMove, { passive: false });
      scrollElement.addEventListener('touchend', handleTouchEnd);
    }

    // Note: Removed redrawcomplete listener - not needed with Shadow DOM marker system

    return () => {
      setIsReady(false);
      
      // Cleanup pinch-to-zoom listeners
      if (scrollElement) {
        scrollElement.removeEventListener('touchstart', handleTouchStart);
        scrollElement.removeEventListener('touchmove', handleTouchMove);
        scrollElement.removeEventListener('touchend', handleTouchEnd);
      }
      
      unregisterWavesurfer(track.id);
      wavesurferRef.current = null;
      wavesurfer.destroy();
    };
  }, [track.file, track.id, waveformTimeline, waveformMinimap]); // Only recreate when plugins change

  // Handle waveform style and normalize with setOptions (no recreation needed)
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    const options: Partial<WaveSurferOptions> = {
      normalize: waveformNormalize,
    };

    if (waveformStyle === 'modern') {
      Object.assign(options, {
        barWidth: 5,
        barGap: 3,
        barRadius: 20,
      });
    } else {
      Object.assign(options, {
        barWidth: undefined,
        barGap: undefined,
        barRadius: undefined,
      });
    }

    wavesurferRef.current.setOptions(options);
    logger.debug('🎨 Waveform style updated without recreation');
  }, [waveformStyle, waveformNormalize, isReady]);

  // Handle zoom separately without recreating wavesurfer - THROTTLED with RAF
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    
    // Skip if already at this zoom level
    if (lastZoomRef.current === zoomLevel) return;
    
    // Cancel any pending zoom
    if (zoomRafRef.current !== null) {
      cancelAnimationFrame(zoomRafRef.current);
    }
    
    // Schedule zoom on next animation frame (throttles to ~60fps)
    zoomRafRef.current = requestAnimationFrame(() => {
      if (wavesurferRef.current) {
        wavesurferRef.current.zoom(zoomLevel);
        lastZoomRef.current = zoomLevel;
      }
      zoomRafRef.current = null;
    });
    
    return () => {
      if (zoomRafRef.current !== null) {
        cancelAnimationFrame(zoomRafRef.current);
      }
    };
  }, [zoomLevel, isReady]);

  // Note: Old loop region system removed - now using Loop v2 Shadow DOM markers

  // Update waveform colors when mute state changes (visual feedback only)
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    const waveColor = track.isMuted ? theme.palette.action.disabled : track.color;
    const progressColor = track.isMuted
      ? theme.palette.action.disabled
      : track.color + '80';

    wavesurferRef.current.setOptions({ waveColor, progressColor });
  }, [track.isMuted, track.color, theme, isReady]);

  // Re-inject markers/loops ONLY when they actually change (not on play/pause/zoom)
  useEffect(() => {
    if (!isReady) return;
    if (isDraggingRef.current) {
      return; // Don't re-inject while dragging
    }
    
    const wsElement = getWaveSurferElement(containerRef);
    if (!wsElement) return;

    const wrapper = wsElement.shadowRoot?.querySelector('.wrapper') as HTMLElement;
    if (!wrapper) return;

    injectMarkersAndLoops(wsElement, loopState, playbackState, theme);
    setupEditModeInteractions(wrapper, wsElement, loopState, playbackState, isDraggingRef, theme);
  }, [isReady, loopState.markers, loopState.loops, loopState.editMode]); // REMOVED: playbackState.isPlaying, playbackState.duration, theme

  // Update volume when it changes (NOT mute - that's handled in store)
  useEffect(() => {
    if (!wavesurferRef.current) return;
    const volume = track.volume * masterVolume;
    wavesurferRef.current.setVolume(volume);
  }, [track.volume, masterVolume]);

  // Update playback rate when it changes
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    wavesurferRef.current.setPlaybackRate(playbackState.playbackRate, true);
  }, [playbackState.playbackRate, isReady]);

  // Update cursor color when theme changes
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    wavesurferRef.current.setOptions({ cursorColor: theme.palette.primary.light });
  }, [theme.palette.secondary.main, isReady]);

  // Toggle WaveSurfer interact option based on edit mode
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    
    const interact = !loopState.editMode; // Disable interact in edit mode
    wavesurferRef.current.setOptions({ interact });
  }, [loopState.editMode, isReady]);


  return (
    <Box
      ref={containerRef}
      data-wavesurfer="true"
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: 60,
        bgcolor: 'background.paper',
        borderRadius: 1,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    />
  );
};

export default memo(WaveformDisplay, (prev, next) => {
  // Only re-render if these specific properties change
  return (
    prev.track.id === next.track.id &&
    prev.track.file === next.track.file &&
    prev.track.color === next.track.color &&
    prev.track.volume === next.track.volume &&
    prev.track.isMuted === next.track.isMuted &&
    prev.track.isSolo === next.track.isSolo
  );
});
