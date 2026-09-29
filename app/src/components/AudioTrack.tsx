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
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import HeadsetIcon from '@mui/icons-material/Headset';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import MicIcon from '@mui/icons-material/Mic';
import DownloadIcon from '@mui/icons-material/Download';
import {useTranslation} from 'react-i18next';
import {useAudioStore} from '../hooks/useAudioStore';
import {useThrottle} from '../hooks/useThrottle';
import WaveformDisplay from './WaveformDisplay';
import RecordableWaveform from './RecordableWaveform';
import type {AudioTrack as AudioTrackType} from '../types/audio';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

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
    toggleRecordArm,
    clearRecording,
  } = useAudioStore();
  const playbackRate = useAudioStore((state) => state.playbackState.playbackRate);

  // DND Kit sortable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: track.id});

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Check if any track has solo enabled
  const hasSolo = tracks.some((t) => t.isSolo);
  const isInactive = hasSolo && !track.isSolo;

  // Track name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);
  // Volume state: use drag value when dragging, otherwise sync with track.volume
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [dragVolume, setDragVolume] = useState(track.volume * 100);
  
  // Collapsed state - synced with store
  const isCollapsed = track.isCollapsed ?? false;
  
  const handleToggleCollapsed = () => {
    updateTrack(track.id, { isCollapsed: !isCollapsed });
  };

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

  const handleDownloadRecording = () => {
    if (!track.file) return;
    
    const url = URL.createObjectURL(track.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = track.file.name || `${track.name}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    <Box ref={setNodeRef} style={style} sx={{ position: 'relative' }}>
      <Paper
        data-track-index={track.id}
        elevation={2}
        sx={{
          p: 2,
          mb: 1.5,
          // Left border: always 4px with track color
          borderLeft: `4px solid ${track.isMuted ? 'rgba(128, 128, 128, 0.3)' : track.color}`,
          // Other borders: always 2px, color changes based on mode
          borderTop: '2px solid',
          borderRight: '2px solid',
          borderBottom: '2px solid',
          borderTopColor: track.isArmed
            ? 'error.main'  // Red when armed
            : loopState.editMode
            ? 'warning.main'  // Orange/yellow in edit mode
            : 'transparent',  // Transparent by default
          borderRightColor: track.isArmed
            ? 'error.main'
            : loopState.editMode
            ? 'warning.main'
            : 'transparent',
          borderBottomColor: track.isArmed
            ? 'error.main'
            : loopState.editMode
            ? 'warning.main'
            : 'transparent',
          bgcolor: track.isArmed ? 'rgba(244, 67, 54, 0.08)' : undefined,
          opacity: track.isMuted || isInactive ? 0.5 : 1,
          transition: isDragging ? 'none' : 'opacity 0.2s, border-color 0.2s ease-in-out',
          boxShadow: isDragging ? 8 : track.isArmed ? 4 : 2,
          zIndex: isDragging ? 1000 : 'auto',
          animation: track.isArmed && !track.recordingState ? 'armed-glow 2s infinite' : 'none',
          '@keyframes armed-glow': {
            '0%, 100%': { boxShadow: '0 0 0 rgba(244, 67, 54, 0)' },
            '50%': { boxShadow: '0 0 20px rgba(244, 67, 54, 0.4)' },
          },
        }}
      >
      {track.isLoading ? (
        // Loading state - minimal skeleton
        <Stack spacing={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid',
                borderColor: 'primary.main',
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' },
                },
              }}
            />
            <Typography variant="subtitle1" fontWeight={600} color="text.secondary" noWrap>
              {track.name}
            </Typography>
          </Box>
          <Box
            sx={{
              height: 96,
              bgcolor: 'action.hover',
              borderRadius: 1,
            }}
          />
        </Stack>
      ) : (
        // Normal state
        <Box>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          {/* Drag handle */}
          <IconButton
            size="small"
            {...attributes}
            {...listeners}
            sx={{
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              opacity: 0.6,
              '&:hover': { opacity: 1 },
            }}
            aria-label="Drag to reorder"
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>

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
              variant="standard"
              sx={{ maxWidth: 300 }}
            />
          ) : (
            <Typography
              variant="subtitle1"
              fontWeight={600}
              noWrap
              onClick={handleStartEditName}
              sx={{
                cursor: 'pointer',
                maxWidth: 300,
                '&:hover': {
                  color: 'primary.main',
                },
              }}
            >
              {track.name.replace('.mp3', '')}
            </Typography>
          )}

          {/* Recording status chip */}
          {track.recordingState === 'recording' && (
            <Chip
              label={t('recording.recording')}
              size="small"
              color="error"
              icon={<FiberManualRecordIcon sx={{ animation: 'blink 1s infinite' }} />}
              sx={{
                ml: 1,
                '@keyframes blink': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0 },
                },
              }}
            />
          )}
          
          <Box sx={{ flexGrow: 1 }} />
          
          <IconButton 
            size="small" 
            onClick={handleToggleCollapsed}
            sx={{ 
              opacity: 0.6,
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.2s',
            }}
            aria-label={isCollapsed ? t('track.expand') : t('track.collapse')}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => setDeleteDialogOpen(true)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Waveform and controls - hidden when collapsed */}
        {/* Waveform */}
        <Box ref={waveformContainerRef} sx={{ position: 'relative', mt: 1.5, mb: 1.5, display: isCollapsed ? 'none' : 'block' }}>
          {track.isRecordable && !track.file ? (
            <RecordableWaveform track={track} />
          ) : (
            <WaveformDisplay track={track} trackId={track.id} />
          )}
        </Box>

        {/* Controls */}
        <Box sx={{ display: isCollapsed ? 'none' : 'block' }}>
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
            <HeadsetIcon />
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
            {track.isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
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

          {/* REC Button (recordable tracks only) */}
          {track.isRecordable && (
            <>
              <Tooltip 
                title={
                  track.file 
                    ? t('recording.clearRecordingFirst') // "Delete recording first to arm"
                    : playbackRate !== 1 && !track.isArmed
                      ? t('recording.normalSpeedRequired')
                      : t('recording.armTrack')
                }
              >
                <span> {/* Wrapper for disabled button tooltip */}
                  <IconButton
                    size="small"
                    onClick={() => toggleRecordArm(track.id)}
                    // Disabled if recording exists, or not at 1x (the take could not be aligned)
                    disabled={!!track.file || (playbackRate !== 1 && !track.isArmed)}
                    sx={{
                      bgcolor: track.isArmed ? 'error.main' : 'transparent',
                      color: track.isArmed ? 'white' : 'inherit',
                      animation: track.recordingState === 'recording'
                        ? 'pulse 1s infinite'
                        : 'none',
                      '&:hover': {
                        bgcolor: track.isArmed ? 'error.dark' : 'action.hover',
                      },
                      '&.Mui-disabled': {
                        color: 'action.disabled',
                      },
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.5 },
                      },
                    }}
                  >
                    {track.recordingState === 'recording' ? (
                      <FiberManualRecordIcon />
                    ) : (
                      <MicIcon />
                    )}
                  </IconButton>
                </span>
              </Tooltip>

              {/* Clear recording button (only when has recording) */}
              {track.file && (
                <>
                  <Tooltip title={t('recording.clearRecording')}>
                    <IconButton
                      size="small"
                      onClick={() => clearRecording(track.id)}
                      disabled={track.recordingState === 'recording'}
                      sx={{
                        color: 'action.active',
                        '&:hover': {
                          color: 'error.main',
                        },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  {/* Download recording button */}
                  <Tooltip title={t('recording.downloadRecording')}>
                    <IconButton
                      size="small"
                      onClick={handleDownloadRecording}
                      disabled={track.recordingState === 'recording'}
                      sx={{
                        ml: 'auto', // Push to far right
                        color: 'action.active',
                        '&:hover': {
                          color: 'primary.main',
                        },
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </>
          )}
        </Stack>
        </Box>
      </Box>
      )}

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
    </Box>
  );
};

export default AudioTrack;
