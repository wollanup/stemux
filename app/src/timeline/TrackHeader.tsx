/**
 * Track controls. `column`: left column next to the lane (large screens).
 * `row`: above the lane, full width (mobile / portrait).
 */

import { useEffect, useRef, useState } from 'react';
import {
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import HeadsetIcon from '@mui/icons-material/Headset';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import MicIcon from '@mui/icons-material/Mic';
import DownloadIcon from '@mui/icons-material/Download';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useThrottle } from '../hooks/useThrottle';
import { getMic, subscribeMic } from '../audio/micSession';
import type { MicRecorder } from '../audio/MicRecorder';
import type { AudioTrack } from '../types/audio';
import { TRACK_COLORS } from '../utils/colors';
import ColorPalette, { ColorDot } from '../components/ColorPalette';

interface TrackHeaderProps {
  track: AudioTrack;
  variant: 'column' | 'row';
  height?: number;
  dimmed: boolean;
  dragHandle: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners; isDragging: boolean };
}

/** Input level of the armed track's microphone */
function LevelMeter() {
  const [recorder, setRecorder] = useState<MicRecorder | null>(getMic);
  const [level, setLevel] = useState(0);
  useEffect(() => subscribeMic(setRecorder), []);
  useEffect(() => {
    if (!recorder) return;
    return recorder.onLevel(setLevel);
  }, [recorder]);

  const db = level > 0 ? 20 * Math.log10(level) : -60;
  const percent = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  const color = level > 0.9 ? 'error.main' : level > 0.5 ? 'warning.main' : 'success.main';
  return (
    <Box sx={{ flex: 1, minWidth: 24, height: 6, bgcolor: 'action.selected', borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: color, transition: 'width 50ms linear' }} />
    </Box>
  );
}

/** Short press: action; long press (500ms): alternative action */
function useLongPress(onShort: () => void, onLong: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 500);
    },
    onPointerUp: () => {
      window.clearTimeout(timer.current);
      if (!fired.current) onShort();
      fired.current = true;
    },
    onPointerCancel: () => {
      window.clearTimeout(timer.current);
      fired.current = true;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

export default function TrackHeader({ track, variant, height, dimmed, dragHandle }: TrackHeaderProps) {
  const { t } = useTranslation();
  const {
    setVolume,
    toggleMute,
    toggleSolo,
    exclusiveSolo,
    unmuteAll,
    removeTrack,
    updateTrack,
    toggleRecordArm,
    clearRecording,
  } = useAudioStore();
  const playbackRate = useAudioStore((state) => state.playbackState.playbackRate);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const throttledSetVolume = useThrottle((id: string, volume: number) => setVolume(id, volume), 50);

  const isCollapsed = track.isCollapsed ?? false;
  const isRecording = track.recordingState === 'recording';

  const solo = useLongPress(
    () => {
      if (track.isMuted) toggleMute(track.id);
      toggleSolo(track.id);
    },
    () => exclusiveSolo(track.id)
  );
  const mute = useLongPress(
    () => {
      if (track.isSolo) toggleSolo(track.id);
      toggleMute(track.id);
    },
    () => unmuteAll()
  );

  const saveName = () => {
    updateTrack(track.id, { name: editedName.trim() || track.name });
    setIsEditingName(false);
  };

  const downloadRecording = () => {
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

  const armDisabled = !!track.file || (playbackRate !== 1 && !track.isArmed);

  const nameRow = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <IconButton
        size="small"
        {...dragHandle.attributes}
        {...dragHandle.listeners}
        sx={{ cursor: dragHandle.isDragging ? 'grabbing' : 'grab', touchAction: 'none', opacity: 0.6, '&:hover': { opacity: 1 } }}
        aria-label="Drag to reorder"
      >
        <DragIndicatorIcon fontSize="small" />
      </IconButton>

      {isEditingName ? (
        <TextField
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName();
            else if (e.key === 'Escape') setIsEditingName(false);
          }}
          autoFocus
          size="small"
          variant="standard"
          sx={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          title={track.name}
          onClick={() => {
            setEditedName(track.name.replace('.mp3', ''));
            setIsEditingName(true);
          }}
          sx={{ flex: 1, minWidth: 0, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
        >
          {track.name.replace('.mp3', '')}
        </Typography>
      )}

      {isRecording && (
        <FiberManualRecordIcon
          fontSize="small"
          color="error"
          sx={{ animation: 'blink 1s infinite', '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } } }}
        />
      )}

      <IconButton
        size="small"
        onClick={() => updateTrack(track.id, { isCollapsed: !isCollapsed })}
        sx={{ opacity: 0.6, transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
        aria-label={isCollapsed ? t('track.expand') : t('track.collapse')}
      >
        <ExpandMoreIcon fontSize="small" />
      </IconButton>
      <IconButton ref={menuButton} size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label={t('track.options')}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
    </Box>
  );

  const controlsRow = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5 }}>
      <Tooltip title={t('track.solo')}>
        <IconButton
          size="small"
          {...solo}
          sx={{
            bgcolor: track.isSolo ? 'primary.main' : 'transparent',
            color: track.isSolo ? 'white' : 'inherit',
            '&:hover': { bgcolor: track.isSolo ? 'primary.dark' : 'action.hover' },
          }}
        >
          <HeadsetIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('track.mute')}>
        <IconButton
          size="small"
          {...mute}
          sx={{
            bgcolor: track.isMuted ? 'error.main' : 'transparent',
            color: track.isMuted ? 'white' : 'inherit',
            '&:hover': { bgcolor: track.isMuted ? 'error.dark' : 'action.hover' },
          }}
        >
          {track.isMuted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      {track.isArmed && !track.file ? (
        <LevelMeter />
      ) : (
        <Slider
          value={dragVolume ?? track.volume * 100}
          onChange={(_, value) => {
            setDragVolume(value as number);
            throttledSetVolume(track.id, (value as number) / 100);
          }}
          onChangeCommitted={(_, value) => {
            setVolume(track.id, (value as number) / 100);
            setDragVolume(null);
          }}
          disabled={track.isMuted}
          size="small"
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => `${Math.round(value)}%`}
          sx={{ flex: 1, minWidth: 48, maxWidth: variant === 'row' ? 200 : undefined, mx: 1, color: track.color }}
        />
      )}

      {track.isRecordable && (
        <>
          <Tooltip
            title={
              track.file
                ? t('recording.clearRecordingFirst')
                : playbackRate !== 1 && !track.isArmed
                  ? t('recording.normalSpeedRequired')
                  : t('recording.armTrack')
            }
          >
            <span>
              <IconButton
                size="small"
                aria-label={t('recording.armTrack')}
                aria-pressed={!!track.isArmed}
                onClick={() => toggleRecordArm(track.id)}
                disabled={armDisabled}
                sx={{
                  bgcolor: track.isArmed ? 'error.main' : 'transparent',
                  color: track.isArmed ? 'white' : 'inherit',
                  '&:hover': { bgcolor: track.isArmed ? 'error.dark' : 'action.hover' },
                  '&.Mui-disabled': { color: 'action.disabled' },
                }}
              >
                {isRecording ? <FiberManualRecordIcon fontSize="small" /> : <MicIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          {track.file && (
            <>
              <Tooltip title={t('recording.clearRecording')}>
                <IconButton size="small" onClick={() => clearRecording(track.id)} sx={{ '&:hover': { color: 'error.main' } }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('recording.downloadRecording')}>
                <IconButton size="small" onClick={downloadRecording} sx={{ '&:hover': { color: 'primary.main' } }}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </>
      )}
    </Box>
  );

  return (
    <Box
      data-track-header
      sx={(theme) => ({
        width: '100%',
        height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: variant === 'column' ? 0 : 0.25,
        pr: 0.5,
        py: variant === 'row' ? 0.5 : 0,
        // Opaque: the playhead and loop overlay pass under the headers
        bgcolor: 'background.paper',
        backgroundImage: track.isArmed
          ? `linear-gradient(${alpha(theme.palette.error.main, 0.12)}, ${alpha(theme.palette.error.main, 0.12)})`
          : 'none',
        borderLeft: `4px solid ${track.isMuted ? theme.palette.action.disabled : track.color}`,
        borderRight: variant === 'column' ? `1px solid ${theme.palette.divider}` : 'none',
        borderBottom: `1px solid ${theme.palette.divider}`,
        // Dim the content only: the background must stay opaque
        '& > *': { opacity: dimmed ? 0.6 : 1 },
      })}
    >
      {nameRow}
      {!isCollapsed && controlsRow}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setColorAnchor(menuButton.current);
          }}
        >
          <ListItemIcon>
            <ColorDot color={track.color} />
          </ListItemIcon>
          <ListItemText>{t('colors.title')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setDeleteDialogOpen(true);
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('track.delete')}</ListItemText>
        </MenuItem>
      </Menu>
      <ColorPalette
        anchorEl={colorAnchor}
        colors={TRACK_COLORS}
        value={track.color}
        onSelect={(color) => updateTrack(track.id, { color })}
        onClose={() => setColorAnchor(null)}
      />

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('track.deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('track.deleteConfirmMessage')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('track.cancelButton')}</Button>
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
    </Box>
  );
}
