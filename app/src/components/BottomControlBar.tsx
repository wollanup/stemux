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
    const handleKeyPress = (e: KeyboardEvent) => {
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
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [playbackState.isPlaying, play, pause]);

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
