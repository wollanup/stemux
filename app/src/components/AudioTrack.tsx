import {useRef, useState} from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Slider,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {Close, Edit, Headset, VolumeOff, VolumeUp,} from '@mui/icons-material';
import {useTranslation} from 'react-i18next';
import {useAudioStore} from '../hooks/useAudioStore';
import {useThrottle} from '../hooks/useThrottle';
import WaveformDisplay from './WaveformDisplay';
import type {AudioTrack as AudioTrackType} from '../types/audio';

interface AudioTrackProps {
  track: AudioTrackType;
}

const AudioTrack = ({ track }: AudioTrackProps) => {
  const { t } = useTranslation();
  const {
    setVolume,
    toggleMute,
    toggleSolo,
    exclusiveSolo,
    unmuteAll,
    removeTrack,
    tracks,
    updateTrack,
    loopState,
} = useAudioStore();

  // Check if any track has solo enabled
  const hasSolo = tracks.some((t) => t.isSolo);
  const isInactive = hasSolo && !track.isSolo;

  // Track name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);
  // Volume state: use drag value when dragging, otherwise sync with track.volume
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [dragVolume, setDragVolume] = useState(track.volume * 100);

  // Throttled volume update (max 20 updates/sec = 50ms)
  const throttledSetVolume = useThrottle((id: string, volume: number) => {
    setVolume(id, volume);
  }, 50);

  const localVolume = isDraggingVolume ? dragVolume : track.volume * 100;

  // Ref for waveform container (for overlay positioning)
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const soloTimerRef = useRef<number | undefined>(undefined);
  const soloStartTimeRef = useRef<number>(0);
  const muteTimerRef = useRef<number | undefined>(undefined);
  const muteStartTimeRef = useRef<number>(0);

  const handleSoloPointerDown = () => {
    soloStartTimeRef.current = Date.now();
    soloTimerRef.current = setTimeout(() => {
      exclusiveSolo(track.id);
      soloStartTimeRef.current = -1;
    }, 500);
  };

  const handleSoloPointerUp = () => {
    if (soloTimerRef.current) {
      clearTimeout(soloTimerRef.current);
    }

    if (soloStartTimeRef.current === -1) {
      soloStartTimeRef.current = 0;
      return;
    }

    const pressDuration = Date.now() - soloStartTimeRef.current;
    if (pressDuration < 500) {
      if (track.isMuted) {
        toggleMute(track.id);
      }
      toggleSolo(track.id);
    }

    soloStartTimeRef.current = 0;
  };

  const handleMutePointerDown = () => {
    muteStartTimeRef.current = Date.now();
    muteTimerRef.current = setTimeout(() => {
      unmuteAll();
      muteStartTimeRef.current = -1;
    }, 500);
  };

  const handleMutePointerUp = () => {
    if (muteTimerRef.current) {
      clearTimeout(muteTimerRef.current);
    }

    if (muteStartTimeRef.current === -1) {
      muteStartTimeRef.current = 0;
      return;
    }

    const pressDuration = Date.now() - muteStartTimeRef.current;
    if (pressDuration < 500) {
      if (track.isSolo) {
        toggleSolo(track.id);
      }
      toggleMute(track.id);
    }

    muteStartTimeRef.current = 0;
  };

  const handleVolumeChange = (_: Event, value: number | number[]) => {
    const newValue = value as number;
    setDragVolume(newValue);
    setIsDraggingVolume(true);
    // Apply volume in real-time with throttling
    throttledSetVolume(track.id, newValue / 100);
  };

  const handleVolumeChangeCommitted = (_: Event | React.SyntheticEvent, value: number | number[]) => {
    const newValue = value as number;
    setVolume(track.id, newValue / 100);
    setIsDraggingVolume(false);
  };

  const handleStartEditName = () => {
    setEditedName(track.name.replace('.mp3', ''));
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const newName = editedName.trim() || track.name;
    updateTrack(track.id, { name: newName });
    setIsEditingName(false);
  };

  const handleCancelEdit = () => {
    setEditedName(track.name);
    setIsEditingName(false);
  };

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        mb: 1.5,
        borderLeft: `4px solid ${track.isMuted ? 'rgba(128, 128, 128, 0.3)' : track.color}`,
        border: loopState.editMode ? '1px solid' : undefined,
        borderColor: loopState.editMode ? 'warning.main' : undefined,
        opacity: track.isMuted || isInactive ? 0.5 : 1,
        transition: 'opacity 0.2s, border 0.2s ease-in-out',
      }}
    >
      <Stack spacing={0}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5} gap={1}>
          {isEditingName ? (
            <TextField
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveName();
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
              autoFocus
              size="small"
              fullWidth
              variant="standard"
              sx={{ flex: 1 }}
            />
          ) : (
            <Typography
              variant="subtitle1"
              fontWeight={600}
              noWrap
              flex={1}
              onClick={handleStartEditName}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  color: 'primary.main',
                },
              }}
            >
              {track.name.replace('.mp3', '')}
            </Typography>
          )}
          {!isEditingName && (
            <IconButton size="small" onClick={handleStartEditName} sx={{ opacity: 0.6 }}>
              <Edit fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" onClick={() => setDeleteDialogOpen(true)}>
            <Close fontSize="small" />
          </IconButton>
        </Box>

        {/* Waveform */}
        <Box mb={1.5} ref={waveformContainerRef} sx={{ position: 'relative' }}>
          <WaveformDisplay track={track} trackId={track.id} />
        </Box>

        {/* Controls */}
        <Box>
          <Stack direction="row" spacing={2} alignItems="center">
          {/* Solo */}
          <IconButton
            size="small"
            disabled={false}
            onPointerDown={handleSoloPointerDown}
            onPointerUp={handleSoloPointerUp}
            onPointerCancel={handleSoloPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            color={track.isSolo ? 'primary' : 'default'}
            sx={{
              bgcolor: track.isSolo ? 'primary.main' : 'transparent',
              color: track.isSolo ? 'white' : 'inherit',
              '&:hover': {
                bgcolor: track.isSolo ? 'primary.dark' : 'action.hover',
              },
            }}
          >
            <Headset />
          </IconButton>

          {/* Mute */}
          <IconButton
            size="small"
            disabled={false}
            onPointerDown={handleMutePointerDown}
            onPointerUp={handleMutePointerUp}
            onPointerCancel={handleMutePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            sx={{
              bgcolor: track.isMuted ? 'error.main' : 'transparent',
              color: track.isMuted ? 'white' : 'inherit',
              '&:hover': {
                bgcolor: track.isMuted ? 'error.dark' : 'action.hover',
              },
            }}
          >
            {track.isMuted ? <VolumeOff /> : <VolumeUp />}
          </IconButton>

          {/* Volume slider */}
          <Box flex={1} px={1} display="flex" alignItems="center" maxWidth={200}>
            <Slider
              value={localVolume}
              onChange={handleVolumeChange}
              onChangeCommitted={handleVolumeChangeCommitted}
              disabled={track.isMuted}
              size="small"
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${Math.round(value)}%`}
              sx={{
                color: track.color,
              }}
            />
          </Box>
        </Stack>
        </Box>
      </Stack>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>{t('track.deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('track.deleteConfirmMessage')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {t('track.cancelButton')}
          </Button>
          <Button
            onClick={() => {
              removeTrack(track.id);
              setDeleteDialogOpen(false);
            }}
            color="error"
            variant="contained"
          >
            {t('track.deleteConfirmButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default AudioTrack;
