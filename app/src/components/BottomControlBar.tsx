import {useEffect, useRef, useState} from 'react';
import {ActionIcon, Box, Group, Popover, Slider, Text, Tooltip} from '@mantine/core';
import {
  IconCircleFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconVolume,
} from '@tabler/icons-react';
import {useAudioStore} from '../hooks/useAudioStore';
import {usePlaybackTime} from '../hooks/usePlaybackTime';
import {useThrottle} from '../hooks/useThrottle';
import {useWheelAdjust} from '../hooks/useWheelAdjust';
import PlaybackSpeedMenu from './PlaybackSpeedMenu';
import PitchMenu from './PitchMenu';
import {useTranslation} from 'react-i18next';
import {audioEngine} from '../audio/AudioEngine';
import {formatBarBeat} from '../tempo/tempo';
import classes from './Bars.module.css';
import { useSmallerThan } from '../theme/palette';

const BottomControlBar = () => {
  const { t } = useTranslation();
  const {
    playbackState,
    play,
    pause,
    setPlaybackRate,
    tracks,
    masterVolume,
    setMasterVolume,
    seek,
  } = useAudioStore();

  const currentTime = usePlaybackTime(); // Use lightweight time tracker
  const isPhone = useSmallerThan('xs');
  const barsTempo = useAudioStore((s) => (s.rulerMode === 'bars' ? s.tempo : null));
  
  // Check if any track is armed or recording
  const isAnyTrackArmed = tracks.some((t) => t.isArmed);
  const isRecording = tracks.some((t) => t.recordingState === 'recording');

  const [tempMasterVolume, setTempMasterVolume] = useState(masterVolume);

  // Throttled master volume update (max 20 updates/sec = 50ms)
  const throttledSetMasterVolume = useThrottle((volume: number) => {
    setMasterVolume(volume);
  }, 50);

  // Wheel over the master volume slider: 2% per step
  const masterWheelRef = useWheelAdjust<HTMLDivElement>((steps) => {
    const volume = useAudioStore.getState().masterVolume;
    setMasterVolume(Math.max(0, Math.min(1, Math.round((volume + steps * 0.02) * 100) / 100)));
  });

  // Sync temp volume with store when it changes externally (adjusted during render, not in an effect)
  const [syncedMasterVolume, setSyncedMasterVolume] = useState(masterVolume);
  if (masterVolume !== syncedMasterVolume) {
    setSyncedMasterVolume(masterVolume);
    setTempMasterVolume(masterVolume);
  }

  useEffect(() => {
    const seekIntervalRef = { current: null as number | null };
    const holdTimeoutRef = { current: null as number | null };
    const keyPressTimeRef = { current: null as number | null };
    const isInContinuousModeRef = { current: false };
    const currentDirectionRef = { current: 0 };
    const continuousStartTimeRef = { current: null as number | null };

    const HOLD_THRESHOLD = 300; // ms avant de commencer le défilement continu
    const SEEK_INTERVAL = 50; // ms entre chaque seek en mode continu
    const SINGLE_PRESS_SEEK = 5; // secondes pour un appui simple
    const CONTINUOUS_SEEK_BASE = 0.5; // secondes par interval en mode continu (vitesse de base)
    const MAX_ACCELERATION = 5; // multiplier max (5x la vitesse de base)
    const ACCELERATION_DURATION = 3000; // ms pour atteindre la vitesse max

    const getAcceleratedSeekAmount = () => {
      if (continuousStartTimeRef.current === null) return CONTINUOUS_SEEK_BASE;

      const elapsed = Date.now() - continuousStartTimeRef.current;
      // Accélération progressive linéaire de 1x à 5x sur ACCELERATION_DURATION ms
      const progress = Math.min(elapsed / ACCELERATION_DURATION, 1);
      const multiplier = 1 + (progress * (MAX_ACCELERATION - 1));
      return CONTINUOUS_SEEK_BASE * multiplier;
    };

    const startContinuousSeek = (direction: number) => {
      if (seekIntervalRef.current !== null) return;

      isInContinuousModeRef.current = true;
      continuousStartTimeRef.current = Date.now();

      seekIntervalRef.current = window.setInterval(() => {
        const currentTime = audioEngine.getCurrentTime();
        const duration = useAudioStore.getState().playbackState.duration;
        const seekAmount = getAcceleratedSeekAmount();
        const newTime = Math.max(0, Math.min(
          currentTime + (direction * seekAmount),
          duration
        ));
        seek(newTime);
      }, SEEK_INTERVAL);
    };

    const stopContinuousSeek = () => {
      if (seekIntervalRef.current !== null) {
        clearInterval(seekIntervalRef.current);
        seekIntervalRef.current = null;
      }
      if (holdTimeoutRef.current !== null) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
      continuousStartTimeRef.current = null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore si on est dans un input ou textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();

        if (playbackState.isPlaying) {
          pause();
        } else {
          play();
        }

        // Remove focus from any button
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();

        // Ctrl+Left : retour au début
        if (e.ctrlKey && e.code === 'ArrowLeft') {
          seek(0);
          return;
        }

        const direction = e.code === 'ArrowLeft' ? -1 : 1;

        // Si c'est la première pression (pas de repeat)
        if (!e.repeat) {
          keyPressTimeRef.current = Date.now();
          currentDirectionRef.current = direction;
          isInContinuousModeRef.current = false;

          // Démarrer un timeout pour passer en mode continu
          holdTimeoutRef.current = window.setTimeout(() => {
            startContinuousSeek(direction);
          }, HOLD_THRESHOLD);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();

        // Arrêter le défilement continu
        stopContinuousSeek();

        // Si c'était un appui court (pas en mode continu)
        if (keyPressTimeRef.current !== null && !isInContinuousModeRef.current) {
          const currentTime = audioEngine.getCurrentTime();
          const duration = useAudioStore.getState().playbackState.duration;
          const newTime = Math.max(0, Math.min(
            currentTime + (currentDirectionRef.current * SINGLE_PRESS_SEEK),
            duration
          ));
          seek(newTime);
        }

        keyPressTimeRef.current = null;
        isInContinuousModeRef.current = false;
        currentDirectionRef.current = 0;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      stopContinuousSeek();
    };
  }, [playbackState.isPlaying, play, pause, seek]);

  // Handler for quick rewind/forward buttons (5 seconds jump)
  // const handleQuickSeek = (direction: -1 | 1) => {
  //   const currentTime = playbackState.currentTime;
  //   const duration = playbackState.duration;
  //   const newTime = Math.max(0, Math.min(duration, currentTime + direction * 5));
  //   seek(newTime);
  // };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSkipToStart = () => {
    seek(0);
  };

  // Rewind button pointer event handlers
  const rewindPointerTimeoutRef = useRef<number | null>(null);
  const rewindSeekIntervalRef = useRef<number | null>(null);
  const rewindStartTimeRef = useRef<number | null>(null);

  const handleRewindPointerDown = () => {
    // Wait before starting continuous mode
    rewindPointerTimeoutRef.current = window.setTimeout(() => {
      rewindStartTimeRef.current = Date.now();
      rewindSeekIntervalRef.current = window.setInterval(() => {
        const currentTime = audioEngine.getCurrentTime();

        // Calculate accelerated seek amount
        const elapsed = Date.now() - (rewindStartTimeRef.current || 0);
        const progress = Math.min(elapsed / 3000, 1); // 3 seconds to max speed
        const multiplier = 1 + (progress * 4); // 1x to 5x
        const seekAmount = 0.5 * multiplier; // Base 0.5s per 50ms

        const newTime = Math.max(0, currentTime - seekAmount);
        seek(newTime);
      }, 50); // 50ms interval
    }, 300); // 300ms hold threshold
  };

  const handleRewindPointerUp = () => {
    // Clear timeout if still waiting
    if (rewindPointerTimeoutRef.current !== null) {
      clearTimeout(rewindPointerTimeoutRef.current);
      rewindPointerTimeoutRef.current = null;

      // Was a short press, jump 5 seconds back
      const currentTime = audioEngine.getCurrentTime();
      const newTime = Math.max(0, currentTime - 5);
      seek(newTime);
    }

    // Clear interval if in continuous mode
    if (rewindSeekIntervalRef.current !== null) {
      clearInterval(rewindSeekIntervalRef.current);
      rewindSeekIntervalRef.current = null;
    }

    rewindStartTimeRef.current = null;
  };

  // Forward button pointer event handlers
  const forwardPointerTimeoutRef = useRef<number | null>(null);
  const forwardSeekIntervalRef = useRef<number | null>(null);
  const forwardStartTimeRef = useRef<number | null>(null);

  const handleForwardPointerDown = () => {
    // Wait before starting continuous mode
    forwardPointerTimeoutRef.current = window.setTimeout(() => {
      forwardStartTimeRef.current = Date.now();
      forwardSeekIntervalRef.current = window.setInterval(() => {
        const currentTime = audioEngine.getCurrentTime();
        const duration = useAudioStore.getState().playbackState.duration;
        
        // Calculate accelerated seek amount
        const elapsed = Date.now() - (forwardStartTimeRef.current || 0);
        const progress = Math.min(elapsed / 3000, 1); // 3 seconds to max speed
        const multiplier = 1 + (progress * 4); // 1x to 5x
        const seekAmount = 0.5 * multiplier; // Base 0.5s per 50ms
        
        const newTime = Math.min(duration, currentTime + seekAmount);
        seek(newTime);
      }, 50); // 50ms interval
    }, 300); // 300ms hold threshold
  };

  const handleForwardPointerUp = () => {
    // Clear timeout if still waiting
    if (forwardPointerTimeoutRef.current !== null) {
      clearTimeout(forwardPointerTimeoutRef.current);
      forwardPointerTimeoutRef.current = null;
      
      // Was a short press, jump 5 seconds forward
      const currentTime = audioEngine.getCurrentTime();
      const duration = playbackState.duration;
      const newTime = Math.min(duration, currentTime + 5);
      seek(newTime);
    }
    
    // Clear interval if in continuous mode
    if (forwardSeekIntervalRef.current !== null) {
      clearInterval(forwardSeekIntervalRef.current);
      forwardSeekIntervalRef.current = null;
    }
    
    forwardStartTimeRef.current = null;
  };

  const hasLoadedTracks = tracks.length > 0 && tracks.every((t) => t.file !== null);

  const volumeSlider = (wheelRef?: (element: HTMLDivElement | null) => void) => (
    <Slider
      ref={wheelRef}
      value={tempMasterVolume * 100}
      onChange={(value) => {
        const newValue = value / 100;
        setTempMasterVolume(newValue);
        throttledSetMasterVolume(newValue);
      }}
      onChangeEnd={(value) => {
        setMasterVolume(value / 100);
      }}
      disabled={!hasLoadedTracks}
      size="sm"
      label={(value) => `${Math.round(value)}%`}
      flex={1}
      thumbProps={{ 'aria-label': t('controls.masterVolume') }}
    />
  );

  return (
    <>
      <Group h="100%" px="md" gap={isPhone ? 'xs' : 'md'} wrap="nowrap">
        {/* FAB Play/Pause centered on top of the bar - Hidden if no tracks */}
        {hasLoadedTracks && (
          <Tooltip
            label={
              playbackState.isPlaying
                ? isRecording
                  ? t('recording.pauseRecording')
                  : t('controls.pause')
                : isAnyTrackArmed
                ? t('recording.startRecording')
                : t('controls.play')
            }
          >
            <ActionIcon
              size={56}
              radius="xl"
              color={isAnyTrackArmed || isRecording ? 'red' : undefined}
              className={classes.fab}
              data-pulse={(!playbackState.isPlaying && isAnyTrackArmed) || undefined}
              aria-label={playbackState.isPlaying ? t('controls.pause') : t('controls.play')}
              onClick={() => (playbackState.isPlaying ? pause() : play())}
            >
              {playbackState.isPlaying ? (
                <IconPlayerPauseFilled size={26} />
              ) : isAnyTrackArmed ? (
                <IconCircleFilled size={22} />
              ) : (
                <IconPlayerPlayFilled size={26} />
              )}
            </ActionIcon>
          </Tooltip>
        )}

        {/* Time display with skip to start button */}
        <Group gap="xs" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={handleSkipToStart}
            disabled={!hasLoadedTracks || isRecording}
            aria-label={t('controls.skipToStart')}
          >
            <IconPlayerSkipBackFilled size={20} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            onPointerDown={handleRewindPointerDown}
            onPointerUp={handleRewindPointerUp}
            onPointerLeave={handleRewindPointerUp}
            onPointerCancel={handleRewindPointerUp}
            disabled={!hasLoadedTracks || isRecording}
            aria-label={t('controls.rewind5')}
            style={{ touchAction: 'none' }}
          >
            <IconPlayerTrackPrevFilled size={20} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            onPointerDown={handleForwardPointerDown}
            onPointerUp={handleForwardPointerUp}
            onPointerLeave={handleForwardPointerUp}
            onPointerCancel={handleForwardPointerUp}
            disabled={!hasLoadedTracks || isRecording}
            aria-label={t('controls.forward5')}
            style={{ touchAction: 'none' }}
          >
            <IconPlayerTrackNextFilled size={20} />
          </ActionIcon>
          <Group gap="xs" wrap="nowrap" miw={{ base: 'auto', xs: 120 }}>
            <Text size="sm" data-testid="current-time">
              {formatTime(currentTime)}
            </Text>
            {/* Desktop only - total time */}
            <Group gap="xs" visibleFrom="xs">
              <Text size="sm" c="dimmed">
                /
              </Text>
              <Text size="sm" c="dimmed">
                {formatTime(playbackState.duration)}
              </Text>
            </Group>
            {/* Bar.beat when the ruler counts bars (not on mobile: the bar is full) */}
            {barsTempo && (
              <Text
                size="sm"
                c="dimmed"
                data-testid="current-bar"
                // Desktop only, discreet, like the time next to it
                visibleFrom="xs"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatBarBeat(currentTime, barsTempo)}
              </Text>
            )}
          </Group>
        </Group>

        <Box flex={1} />

        {/* Master Volume - Desktop: inline slider, Mobile: popover */}
        <Group gap="xs" wrap="nowrap" miw={200} visibleFrom="md">
          <IconVolume size={20} />
          {volumeSlider(masterWheelRef)}
        </Group>

        <Popover position="top" shadow="md">
          <Popover.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!hasLoadedTracks}
              hiddenFrom="md"
              aria-label={t('controls.masterVolume')}
            >
              <IconVolume size={22} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="md" w={250}>
            <Text size="xs" c="dimmed" mb="xs">
              {t('controls.masterVolume')}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <IconVolume size={18} />
              {volumeSlider()}
            </Group>
          </Popover.Dropdown>
        </Popover>

        {/* Pitch and playback speed */}
        <PitchMenu disabled={!hasLoadedTracks} />
        <PlaybackSpeedMenu
          currentRate={playbackState.playbackRate}
          disabled={!hasLoadedTracks}
          onRateChange={setPlaybackRate}
        />
      </Group>
    </>
  );
};

export default BottomControlBar;
