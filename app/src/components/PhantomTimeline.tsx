import { useEffect, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { useAudioStore } from '../hooks/useAudioStore';

const PhantomTimeline = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<any>(null);
  const loopRegionRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  const theme = useTheme();
  const { playbackState, seek, loopRegion, setLoopRegion, zoomLevel } = useAudioStore();

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
      ...(zoomLevel > 1 && { minPxPerSec: 50 * zoomLevel }),
    });

    wavesurferRef.current = wavesurfer;

    // Register regions plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsPluginRef.current = regions;

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

    // Create empty buffer with duration of longest track
    const emptyBuffer = new AudioBuffer({
      length: Math.ceil(playbackState.duration * 44100),
      sampleRate: 44100,
      numberOfChannels: 1,
    });

    wavesurfer.load('', [emptyBuffer.getChannelData(0)], emptyBuffer.duration);

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
  }, [playbackState.duration, seek, theme, zoomLevel, setLoopRegion]);

  // Manage loop region separately - only when ready
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current || playbackState.duration === 0) return;

    const hasValidLoop = loopRegion.start < loopRegion.end && loopRegion.end > 0;

    // Clear existing region
    if (loopRegionRef.current) {
      loopRegionRef.current.remove();
      loopRegionRef.current = null;
    }

    // Create new region if valid
    if (hasValidLoop) {
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
  }, [isReady, loopRegion.start, loopRegion.end, loopRegion.enabled, playbackState.duration, theme]);

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
