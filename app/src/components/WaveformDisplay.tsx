import { useEffect, useRef, useState, memo } from 'react';
import { Box, useTheme } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { AudioTrack } from '../types/audio';
import { useAudioStore, registerWavesurfer, unregisterWavesurfer, markTrackFinished } from '../hooks/useAudioStore';

import { setPlaybackTime } from '../hooks/usePlaybackTime';

interface WaveformDisplayProps {
  track: AudioTrack;
  trackId: string;
}

const WaveformDisplay = ({ track }: WaveformDisplayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<any>(null);
  const loopRegionRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  const theme = useTheme();
  const {
    seek,
    zoomLevel,
    loopRegion,
    playbackState,
    masterVolume,
    waveformStyle,
    waveformNormalize,
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

    // Create regions plugin instance
    const regions = RegionsPlugin.create();
    regionsPluginRef.current = regions;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      cursorColor: theme.palette.text.primary,
      cursorWidth: 2,
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
      plugins: [regions],
    });

    wavesurferRef.current = wavesurfer;

    // Register this instance
    registerWavesurfer(track.id, wavesurfer);

    // Style regions when created
    regions.on('region-created', (region) => {
      if (!region.element) return;
      const handles = region.element.querySelectorAll('[part~="region-handle"]');
      handles.forEach((handle: Element) => {
        const htmlHandle = handle as HTMLElement;
        htmlHandle.style.display = 'none';
      });
    });

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

        // Check if we've passed the loop end point
        const { loopRegion } = useAudioStore.getState();
        if (loopRegion.enabled && loopRegion.start < loopRegion.end && currentTime >= loopRegion.end) {
          console.log('🔁 Loop end reached, seeking back to:', loopRegion.start);
          seek(loopRegion.start);
        }

        lastTimeUpdate = now;
      }
    });

    // Detect when playback finishes
    wavesurfer.on('finish', () => {
      console.log('🏁 Playback finished for track:', track.id);
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

      // Set initial state from track data
      const allTracks = useAudioStore.getState().tracks;
      const hasSoloedTracks = allTracks.some(t => t.isSolo);
      const shouldBeMuted = track.isMuted || (hasSoloedTracks && !track.isSolo);

      wavesurfer.setMuted(shouldBeMuted);
      wavesurfer.setVolume(track.volume * useAudioStore.getState().masterVolume);
      wavesurfer.setPlaybackRate(useAudioStore.getState().playbackState.playbackRate, true);
    });

    // Simple click handler - just seek
    wavesurfer.on('click', (progress) => {
      const duration = wavesurfer.getDuration();
      const time = progress * duration;
      seekRef.current(time); // Use ref to avoid dependency
    });

    // Listen for redrawcomplete to ensure regions persist after resize
    wavesurfer.on('redrawcomplete', () => {
      // Trigger region re-render by forcing isReady update
      setIsReady(false);
      setTimeout(() => setIsReady(true), 0);
    });

    return () => {
      setIsReady(false);
      unregisterWavesurfer(track.id);
      wavesurferRef.current = null;
      regionsPluginRef.current = null;
      loopRegionRef.current = null;
      wavesurfer.destroy();
    };
  }, [track.file, track.id, waveformStyle, waveformNormalize]); // Recreate when settings change

  // Handle zoom separately without recreating wavesurfer
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    // Direct passthrough - zoomLevel = minPxPerSec
    wavesurferRef.current.zoom(zoomLevel);
  }, [zoomLevel, isReady]);

  // Manage loop region separately - only when ready
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current || !wavesurferRef.current) return;

    const hasValidLoop = loopRegion.enabled && loopRegion.start < loopRegion.end && loopRegion.end > 0;

    // Clear existing region
    if (loopRegionRef.current) {
      loopRegionRef.current.remove();
      loopRegionRef.current = null;
    }

    // Create new region if valid (visual only, no loop logic here)
    if (hasValidLoop) {
      const region = regionsPluginRef.current.addRegion({
        start: loopRegion.start,
        end: loopRegion.end,
        color: `${theme.palette.primary.main}30`,
        drag: false,
        resize: false,
      });
      loopRegionRef.current = region;
    }
  }, [isReady, loopRegion.enabled, loopRegion.start, loopRegion.end, theme]);

  // Update waveform colors when mute state changes (visual feedback only)
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    const waveColor = track.isMuted ? theme.palette.action.disabled : track.color;
    const progressColor = track.isMuted
      ? theme.palette.action.disabled
      : track.color + '80';

    wavesurferRef.current.setOptions({ waveColor, progressColor });
  }, [track.isMuted, track.color, theme, isReady]);

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
