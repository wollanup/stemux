import {useEffect, useRef, useState} from 'react';
import {AppBar, Box, Button, Fab, IconButton, Popover, Slider, Stack, styled, Toolbar, Tooltip, Typography} from '@mui/material';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SpeedIcon from '@mui/icons-material/Speed';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import {useAudioStore} from '../hooks/useAudioStore';
import {usePlaybackTime} from '../hooks/usePlaybackTime';
import {useThrottle} from '../hooks/useThrottle';
import PlaybackSpeedDrawer from './PlaybackSpeedDrawer';
import {useTranslation} from 'react-i18next';
import {audioEngine} from '../audio/AudioEngine';

const StyledFab = styled(Fab)({
  position: 'absolute',
  zIndex: 1,
  top: -30,
  left: 0,
  right: 0,
  margin: '0 auto',
});

// const SmallFab = styled(Fab)(({ theme }) => ({
//   position: 'absolute',
//   zIndex: 1,
//   top: -20,
//   width: 40,
//   height: 40,
//   minHeight: 40,
//   backgroundColor: theme.palette.background.paper,
//   color: theme.palette.text.secondary,
//   boxShadow: theme.shadows[2],
//   '&:hover': {
//     backgroundColor: theme.palette.mode === 'dark'
//       ? theme.palette.action.hover
//       : theme.palette.grey[100],
//   },
//   '&.Mui-disabled': {
//     backgroundColor: theme.palette.background.paper,
//     color: theme.palette.action.disabled,
//   },
// }));

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
  
  // Check if any track is armed or recording
  const isAnyTrackArmed = tracks.some((t) => t.isArmed);
  const isRecording = tracks.some((t) => t.recordingState === 'recording');

  const [speedDrawerOpen, setSpeedDrawerOpen] = useState(false);
  const [tempMasterVolume, setTempMasterVolume] = useState(masterVolume);
  const [volumeAnchorEl, setVolumeAnchorEl] = useState<HTMLButtonElement | null>(null);

  // Throttled master volume update (max 20 updates/sec = 50ms)
  const throttledSetMasterVolume = useThrottle((volume: number) => {
    setMasterVolume(volume);
  }, 50);

  // Sync temp volume with store when it changes externally
  useEffect(() => {
    setTempMasterVolume(masterVolume);
  }, [masterVolume]);

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

  return (
    <AppBar
      position="fixed"
      color="default"
      elevation={8}
      sx={{
        top: 'auto',
        bottom: 0,
        bgcolor: 'background.paper',
      }}
    >
      <Toolbar sx={{ gap: 2 }}>
        {/* FAB Play/Pause centered on top of AppBar - Hidden if no tracks */}
        {hasLoadedTracks && (
          <>
            {/* Quick Rewind Button */}
            {/*<SmallFab*/}
            {/*  size="small"*/}
            {/*  disabled={!hasLoadedTracks}*/}
            {/*  onClick={() => handleQuickSeek(-1)}*/}
            {/*  aria-label="Rewind 5 seconds"*/}
            {/*  sx={{*/}
            {/*    left: '50%',*/}
            {/*    transform: 'translateX(calc(-100% - 42px))',*/}
            {/*  }}*/}
            {/*>*/}
            {/*  <FastRewind fontSize="small" />*/}
            {/*</SmallFab>*/}

            {/* Play/Pause FAB */}
            <Tooltip
              title={
                playbackState.isPlaying
                  ? isRecording
                    ? t('recording.pauseRecording')
                    : t('controls.pause')
                  : isAnyTrackArmed
                  ? t('recording.startRecording')
                  : t('controls.play')
              }
            >
              <StyledFab
                color={isAnyTrackArmed || isRecording ? 'error' : 'primary'}
                aria-label={playbackState.isPlaying ? t('controls.pause') : t('controls.play')}
                onClick={() => (playbackState.isPlaying ? pause() : play())}
                sx={{
                  animation: !playbackState.isPlaying && isAnyTrackArmed
                    ? 'rec-pulse 2s ease-in-out infinite'
                    : 'none',
                  '@keyframes rec-pulse': {
                    '0%, 100%': {
                      transform: 'scale(1)',
                      boxShadow: '0 0 0 0 rgba(244, 67, 54, 0.7)',
                    },
                    '50%': {
                      transform: 'scale(1.05)',
                      boxShadow: '0 0 0 10px rgba(244, 67, 54, 0)',
                    },
                  },
                }}
              >
                {playbackState.isPlaying ? (
                  <PauseIcon />
                ) : isAnyTrackArmed ? (
                  <FiberManualRecordIcon />
                ) : (
                  <PlayArrowIcon />
                )}
              </StyledFab>
            </Tooltip>

            {/* Quick Forward Button */}
            {/*<SmallFab*/}
            {/*  size="small"*/}
            {/*  disabled={!hasLoadedTracks}*/}
            {/*  onClick={() => handleQuickSeek(1)}*/}
            {/*  aria-label="Forward 5 seconds"*/}
            {/*  sx={{*/}
            {/*    left: '50%',*/}
            {/*    transform: 'translateX(42px)',*/}
            {/*  }}*/}
            {/*>*/}
            {/*  <FastForward fontSize="small" />*/}
            {/*</SmallFab>*/}
          </>
        )}

        {/* Time display with skip to start button */}
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            size="small"
            onClick={handleSkipToStart}
            disabled={!hasLoadedTracks || isRecording}
            aria-label={t('controls.skipToStart')}
          >
            <SkipPreviousIcon />
          </IconButton>
          <IconButton
            size="small"
            onPointerDown={handleRewindPointerDown}
            onPointerUp={handleRewindPointerUp}
            onPointerLeave={handleRewindPointerUp}
            onPointerCancel={handleRewindPointerUp}
            disabled={!hasLoadedTracks || isRecording}
            aria-label={t('controls.rewind5')}
            sx={{ touchAction: 'none' }}
          >
            <FastRewindIcon />
          </IconButton>
          <IconButton
            size="small"
            onPointerDown={handleForwardPointerDown}
            onPointerUp={handleForwardPointerUp}
            onPointerLeave={handleForwardPointerUp}
            onPointerCancel={handleForwardPointerUp}
            disabled={!hasLoadedTracks || isRecording}
            aria-label={t('controls.forward5')}
            sx={{ touchAction: 'none' }}
          >
            <FastForwardIcon />
          </IconButton>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { xs: 'auto', sm: 120 } }}>
            <Typography variant="body2" data-testid="current-time">
              {formatTime(currentTime)}
            </Typography>
            {/* Desktop only - total time */}
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                /
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatTime(playbackState.duration)}
              </Typography>
            </Box>
          </Stack>
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        {/* Master Volume - Desktop: inline slider, Mobile: popover */}
        {/* Desktop version (md and up) */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            minWidth: 200,
            display: { xs: 'none', md: 'flex' }
          }}
        >
          <VolumeUpIcon fontSize="small" />
          <Slider
            value={tempMasterVolume * 100}
            onChange={(_, value) => {
              const newValue = (value as number) / 100;
              setTempMasterVolume(newValue);
              throttledSetMasterVolume(newValue);
            }}
            onChangeCommitted={(_, value) => {
              setMasterVolume((value as number) / 100);
            }}
            disabled={!hasLoadedTracks}
            size="small"
            color="secondary"
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value)}%`}
            sx={{ flex: 1 }}
            aria-label={t('controls.masterVolume')}
          />
        </Stack>

        {/* Mobile version (xs to sm) - just icon button */}
        <IconButton
          size="small"
          onClick={(e) => setVolumeAnchorEl(e.currentTarget)}
          disabled={!hasLoadedTracks}
          sx={{ display: { xs: 'flex', md: 'none' } }}
          aria-label={t('controls.masterVolume')}
        >
          <VolumeUpIcon />
        </IconButton>

        {/* Volume Popover for mobile */}
        <Popover
          open={Boolean(volumeAnchorEl)}
          anchorEl={volumeAnchorEl}
          onClose={() => setVolumeAnchorEl(null)}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
        >
          <Box sx={{ p: 2, width: 250 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              {t('controls.masterVolume')}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <VolumeUpIcon fontSize="small" />
              <Slider
                value={tempMasterVolume * 100}
                onChange={(_, value) => {
                  const newValue = (value as number) / 100;
                  setTempMasterVolume(newValue);
                  throttledSetMasterVolume(newValue);
                }}
                onChangeCommitted={(_, value) => {
                  setMasterVolume((value as number) / 100);
                }}
                size="small"
                color="secondary"
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${Math.round(value)}%`}
                sx={{ flex: 1 }}
              />
            </Stack>
          </Box>
        </Popover>

        {/* Playback speed */}
        <Button
          startIcon={<SpeedIcon />}
          onClick={() => setSpeedDrawerOpen(true)}
          disabled={!hasLoadedTracks}
          variant="outlined"
          size="small"
          color="secondary"
          sx={{ minWidth: 100, textTransform: 'none' }}
        >
          {playbackState.playbackRate.toFixed(2)}x
        </Button>
      </Toolbar>

      {/* Playback Speed Drawer */}
      <PlaybackSpeedDrawer
        open={speedDrawerOpen}
        currentRate={playbackState.playbackRate}
        onClose={() => setSpeedDrawerOpen(false)}
        onRateChange={setPlaybackRate}
      />
    </AppBar>
  );
};

export default BottomControlBar;
