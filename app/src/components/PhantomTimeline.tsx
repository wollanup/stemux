import { useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { useAudioStore } from '../hooks/useAudioStore';
import { usePlaybackTime } from '../hooks/usePlaybackTime';

const PhantomTimeline = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<any>(null);
  const loopRegionRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  const theme = useTheme();
  const { playbackState, seek, loopRegion, setLoopRegion } = useAudioStore();
  const currentTime = usePlaybackTime(); // Use lightweight time tracker
  // Note: zoomLevel removed - phantom timeline stays at fixed zoom

  // Create wavesurfer instance
  useEffect(() => {
    if (!containerRef.current || playbackState.duration === 0) return;

    // Create regions plugin instance
    const regions = RegionsPlugin.create();
    regionsPluginRef.current = regions;

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
      plugins: [regions],
    });

    wavesurferRef.current = wavesurfer;

    // Style regions when created
    regions.on('region-created', (region) => {
      if (!region.element) return;

      // Style the handles
      const handles = region.element.querySelectorAll('[part~="region-handle"]');
      handles.forEach((handle: Element) => {
        const htmlHandle = handle as HTMLElement;
        htmlHandle.style.width = '16px';
        htmlHandle.style.height = '16px';
        htmlHandle.style.borderRadius = '50%';
        htmlHandle.style.backgroundColor = theme.palette.primary.main;
        htmlHandle.style.border = 'none';
        htmlHandle.style.top = '50%';
        htmlHandle.style.transform = 'translateY(-50%)';
        htmlHandle.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.4)';
        htmlHandle.style.opacity = '1';
        htmlHandle.style.zIndex = '10';
      });

      // Style left handle
      const leftHandle = region.element.querySelector('[part~="region-handle-left"]') as HTMLElement;
      if (leftHandle) {
        leftHandle.style.left = '-8px';
      }

      // Style right handle
      const rightHandle = region.element.querySelector('[part~="region-handle-right"]') as HTMLElement;
      if (rightHandle) {
        rightHandle.style.right = '-8px';
      }
    });

    // Load empty waveform with just duration (no actual audio needed)
    const duration = playbackState.duration || 1;
    const peaks = [new Float32Array(Math.ceil(duration * 10))]; // Minimal peaks data
    wavesurfer.load('', peaks, duration);

    // Mark as ready when waveform is loaded
    wavesurfer.on('ready', () => {
      setIsReady(true);
    });

    // Handle clicks to seek
    wavesurfer.on('click', (progress) => {
      const time = progress * playbackState.duration;
      seek(time);
    });

    // Handle region updates - debounce to sync only at the end of drag for performance
    let updateTimeout: number | null = null;

    regions.on('region-updated', (region) => {
      // Clear previous timeout
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }

      // Set new timeout - will only execute if no more updates come in 150ms
      updateTimeout = window.setTimeout(() => {
        setLoopRegion(region.start, region.end);
        updateTimeout = null;
      }, 150);
    });

    // Listen for redrawcomplete to ensure regions persist after resize
    wavesurfer.on('redrawcomplete', () => {
      // Trigger region re-render by forcing isReady update
      setIsReady(false);
      setTimeout(() => setIsReady(true), 0);
    });

    return () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      setIsReady(false);
      wavesurferRef.current = null;
      regionsPluginRef.current = null;
      loopRegionRef.current = null;
      wavesurfer.destroy();
    };
  }, [playbackState.duration, seek, theme, setLoopRegion]);

  // Handle zoom separately without recreating wavesurfer
  // DISABLED: Keep phantom timeline at fixed zoom to avoid scroll issues on mobile
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    const wavesurfer = wavesurferRef.current;

    try {
      // Always keep at zoom level 1 (fit all content)
      wavesurfer.zoom(0);
    } catch {
      // Silently ignore if audio not loaded yet
    }
  }, [isReady]); // Removed zoomLevel dependency

  // Manage loop region separately - only when ready
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current || playbackState.duration === 0) return;

    const hasValidLoop = loopRegion.start < loopRegion.end && loopRegion.end > 0;

    // Clear existing region
    if (loopRegionRef.current) {
      loopRegionRef.current.remove();
      loopRegionRef.current = null;
    }

    // If setting loop, show a marker at the start position
    if (loopRegion.isSettingLoop) {
      const marker = regionsPluginRef.current.addRegion({
        start: loopRegion.loopStartMarker,
        content: '⏱',
        color: theme.palette.warning.main,
      });
      loopRegionRef.current = marker;

      // Allow clicking on marker to seek to that position
      marker.on('click', () => {
        console.log('⏱ Marker clicked, seeking to:', loopRegion.loopStartMarker);
        seek(loopRegion.loopStartMarker);
      });
    }
    // Create new region if valid
    else if (hasValidLoop) {
      const region = regionsPluginRef.current.addRegion({
        start: loopRegion.start,
        end: loopRegion.end,
        color: loopRegion.enabled
          ? `${theme.palette.primary.main}AA`
          : `${theme.palette.primary.main}40`,
        drag: true,
        resize: true,
      });
      loopRegionRef.current = region;
    }
  }, [isReady, loopRegion.start, loopRegion.end, loopRegion.enabled, loopRegion.isSettingLoop, loopRegion.loopStartMarker, playbackState.duration, theme]);

  // Update cursor position
  useEffect(() => {
    if (wavesurferRef.current && playbackState.duration > 0) {
      const progress = currentTime / playbackState.duration;
      wavesurferRef.current.seekTo(progress);
    }
  }, [currentTime, playbackState.duration]);

  // Update loop region color when enabled state changes
  useEffect(() => {
    if (!loopRegionRef.current) return;

    const color = loopRegion.enabled
      ? `${theme.palette.primary.main}40`
      : `${theme.palette.primary.main}20`;

    loopRegionRef.current.setOptions({ color });
  }, [loopRegion.enabled, theme]);

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
    />
  );
};

export default PhantomTimeline;
