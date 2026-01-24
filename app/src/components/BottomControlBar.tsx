import { useEffect, useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Stack,
  Button,
  Fab,
  styled,
  Slider,
  IconButton,
  Popover,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Speed,
  VolumeUp,
  SkipPrevious,
  Loop,
} from '@mui/icons-material';
import { useAudioStore } from '../hooks/useAudioStore';
import { usePlaybackTime } from '../hooks/usePlaybackTime';
import PlaybackSpeedDrawer from './PlaybackSpeedDrawer';
import { useTranslation } from 'react-i18next';

const StyledFab = styled(Fab)({
  position: 'absolute',
  zIndex: 1,
  top: -30,
  left: 0,
  right: 0,
  margin: '0 auto',
});

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
    loopRegion,
  } = useAudioStore();
  
  const currentTime = usePlaybackTime(); // Use lightweight time tracker

  const [speedDrawerOpen, setSpeedDrawerOpen] = useState(false);
  const [tempMasterVolume, setTempMasterVolume] = useState(masterVolume);
  const [volumeAnchorEl, setVolumeAnchorEl] = useState<HTMLButtonElement | null>(null);

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
      const seekAmount = CONTINUOUS_SEEK_BASE * multiplier;
      
      return seekAmount;
    };

    const startContinuousSeek = (direction: number) => {
      if (seekIntervalRef.current !== null) return;
      
      isInContinuousModeRef.current = true;
      continuousStartTimeRef.current = Date.now();
      
      seekIntervalRef.current = window.setInterval(() => {
        const currentTime = useAudioStore.getState().playbackState.currentTime;
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
          const currentTime = useAudioStore.getState().playbackState.currentTime;
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSkipToStart = () => {
    // If loop is enabled, go to loop start, otherwise go to beginning
    if (loopRegion.enabled && loopRegion.start < loopRegion.end) {
      seek(loopRegion.start);
    } else {
      seek(0);
    }
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
          <StyledFab
            color="primary"
            aria-label={playbackState.isPlaying ? t('controls.pause') : t('controls.play')}
            onClick={() => (playbackState.isPlaying ? pause() : play())}
          >
            {playbackState.isPlaying ? <Pause /> : (loopRegion.enabled ? <Loop /> : <PlayArrow />)}
          </StyledFab>
        )}

        {/* Time display with skip to start button */}
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton
            size="small"
            onClick={handleSkipToStart}
            disabled={!hasLoadedTracks}
            aria-label={t('controls.skipToStart')}
          >
            <SkipPrevious />
          </IconButton>
          <Stack direction="row" spacing={1} alignItems="center" minWidth={120}>
            <Typography variant="body2" fontFamily="monospace">
              {formatTime(currentTime)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              /
            </Typography>
            <Typography variant="body2" color="text.secondary" fontFamily="monospace">
              {formatTime(playbackState.duration)}
            </Typography>
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
          <VolumeUp fontSize="small" />
          <Slider
            value={tempMasterVolume * 100}
            onChange={(_, value) => {
              setTempMasterVolume((value as number) / 100);
            }}
            onChangeCommitted={(_, value) => {
              setMasterVolume((value as number) / 100);
            }}
            disabled={!hasLoadedTracks}
            size="small"
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
          <VolumeUp />
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
              <VolumeUp fontSize="small" />
              <Slider
                value={tempMasterVolume * 100}
                onChange={(_, value) => {
                  setTempMasterVolume((value as number) / 100);
                }}
                onChangeCommitted={(_, value) => {
                  setMasterVolume((value as number) / 100);
                }}
                size="small"
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${Math.round(value)}%`}
                sx={{ flex: 1 }}
              />
            </Stack>
          </Box>
        </Popover>

        {/* Playback speed */}
        <Button
          startIcon={<Speed />}
          onClick={() => setSpeedDrawerOpen(true)}
          disabled={!hasLoadedTracks}
          variant="outlined"
          size="small"
          color="inherit"
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
