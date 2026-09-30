import { alpha, Box, IconButton, Typography, Chip, Menu, MenuItem, ListItemIcon, ListItemText, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, useTheme } from '@mui/material';
import { Close, MoreVert, Repeat as LoopIcon, Delete, PlayArrow, Pause, ArrowForward, Login, Check } from '@mui/icons-material';
import { useAudioStore } from '../hooks/useAudioStore';
import { loopColor, markerColor } from '../utils/colors';
import { useState } from 'react';
import {logger} from '../utils/logger';
import { useTranslation } from 'react-i18next';

const MarkersPanel = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { loopState, removeMarker, removeLoop, seek, createLoop, setActiveLoop, play, toggleLoopPlayback, armLoop } = useAudioStore();
  const isPlaying = useAudioStore((s) => s.playbackState.isPlaying);
  const armedLoopId = useAudioStore((s) => s.armedLoopId);
  const [menuAnchor, setMenuAnchor] = useState<{ element: HTMLElement; markerId: string } | null>(null);
  const [loopMenuAnchor, setLoopMenuAnchor] = useState<{ element: HTMLElement; loopId: string } | null>(null);
  const [loopStartMarker, setLoopStartMarker] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  if (loopState.markers.length === 0) return null;

  const handleMarkerClick = (time: number) => {
    // Disable loop when clicking on a marker (cleaner UX)
    if (loopState.activeLoopId) {
      setActiveLoop(null);
    }
    
    seek(time);
    play();
  };

  const handleMenuClick = (e: React.MouseEvent<HTMLElement>, markerId: string) => {
    e.stopPropagation();
    setMenuAnchor({ element: e.currentTarget, markerId });
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleLoopEndpoint = (markerId: string) => {
    if (loopStartMarker === null) {
      // First click: set as loop start
      setLoopStartMarker(markerId);
      logger.debug('🔁 Loop start marker set:', markerId);
    } else if (loopStartMarker === markerId) {
      // Same marker clicked twice: cancel
      setLoopStartMarker(null);
      logger.debug('❌ Loop start marker cancelled');
    } else {
      // Second click: create loop
      const markers = [...loopState.markers].sort((a, b) => a.time - b.time);
      const startIdx = markers.findIndex(m => m.id === loopStartMarker);
      const endIdx = markers.findIndex(m => m.id === markerId);
      
      const [start, end] = startIdx < endIdx 
        ? [loopStartMarker, markerId]
        : [markerId, loopStartMarker];
      
      // Check if identical loop already exists
      const existingLoop = loopState.loops.find(
        l => l.startMarkerId === start && l.endMarkerId === end
      );
      
      if (existingLoop) {
        logger.debug('⚠️ Identical loop already exists, skipping creation');
      } else {
        createLoop(start, end);
        logger.debug('✅ Loop created:', start, '→', end);
      }
      
      setLoopStartMarker(null);
    }
    handleMenuClose();
  };

  const handleDelete = (markerId: string) => {
    removeMarker(markerId);
    if (loopStartMarker === markerId) {
      setLoopStartMarker(null);
    }
    handleMenuClose();
  };

  const handlePointerDown = (_e: React.PointerEvent, markerId: string) => {
    const timer = window.setTimeout(() => {
      // Long press detected
      handleLoopEndpoint(markerId);
      setLongPressTimer(null);
    }, 500); // 500ms for long press
    setLongPressTimer(timer);
  };

  const handlePointerUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleLoopMenuClick = (e: React.MouseEvent<HTMLElement>, loopId: string) => {
    e.stopPropagation();
    setLoopMenuAnchor({ element: e.currentTarget, loopId });
  };

  const handleLoopMenuClose = () => {
    setLoopMenuAnchor(null);
  };

  const handleDeleteLoop = (loopId: string) => {
    removeLoop(loopId);
    handleLoopMenuClose();
  };

  // Disabling the loop without pausing lets playback run past its end
  const handleContinueAfterLoop = () => {
    setActiveLoop(null);
    handleLoopMenuClose();
  };

  // Loops once the playhead gets in; a second click cancels
  const handleLoopOnEntry = (loopId: string) => {
    armLoop(armedLoopId === loopId ? null : loopId);
    handleLoopMenuClose();
  };

  const isLoopPlaying = (loopId: string) =>
    isPlaying && loopState.activeLoopId === loopId && loopState.loops.some((l) => l.id === loopId && l.enabled);

  const handleDeleteAll = () => {
    // Remove all loops first
    loopState.loops.forEach(loop => removeLoop(loop.id));
    // Then remove all markers
    loopState.markers.forEach(marker => removeMarker(marker.id));
    setDeleteAllDialogOpen(false);
  };

  const getMarkerNumber = (markerId: string) => {
    const index = loopState.markers.findIndex(m => m.id === markerId);
    return index !== -1 ? index + 1 : '?';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        px: 2,
        py: 1,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Markers Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mr: 1 }}>
          {t('markers.markers')}
        </Typography>
        {loopState.markers.map((marker, index) => {
          const isInActiveLoop = loopState.loops.find(
            l => l.enabled && (l.startMarkerId === marker.id || l.endMarkerId === marker.id)
          );
          
          const isLoopEndpoint = loopState.loops.some(
            l => l.startMarkerId === marker.id || l.endMarkerId === marker.id
          );

          const isLoopStartSelection = loopStartMarker === marker.id;
          const color = markerColor(marker.id, loopState);

          return (
            <Chip
              key={marker.id}
              label={`${index + 1} - ${formatTime(marker.time)}`}
              size="small"
              icon={<PlayArrow fontSize="small" />}
              variant={isLoopEndpoint ? 'outlined' : 'filled'}
              onClick={() => handleMarkerClick(marker.time)}
              onPointerDown={(e) => handlePointerDown(e, marker.id)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDelete={(e) => handleMenuClick(e as React.MouseEvent<HTMLElement>, marker.id)}
              deleteIcon={<MoreVert fontSize="small" />}
              sx={{
                cursor: 'pointer',
                // Loop ends take the color of their loop
                ...(isLoopEndpoint && { borderColor: color, '& .MuiChip-icon': { color } }),
                ...(isInActiveLoop && {
                  bgcolor: color,
                  color: theme.palette.getContrastText(color),
                  '& .MuiChip-icon, & .MuiChip-deleteIcon': { color: 'inherit' },
                }),
                ...(isLoopStartSelection && { bgcolor: 'warning.main', color: 'warning.contrastText' }),
                '&:hover': {
                  bgcolor: isInActiveLoop ? alpha(color, 0.8) : 'action.hover',
                },
              }}
            />
          );
        })}
        
        {/* Delete all button */}
        <IconButton
          size="small"
          onClick={() => setDeleteAllDialogOpen(true)}
          disabled={loopState.markers.length === 0 && loopState.loops.length === 0}
          sx={{ ml: 'auto' }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* Loops Section */}
      {loopState.loops.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mr: 1 }}>
            {t('markers.loops')}
          </Typography>
          {loopState.loops.map((loop) => {
            const startNum = getMarkerNumber(loop.startMarkerId);
            const endNum = getMarkerNumber(loop.endMarkerId);
            const isActive = loop.enabled;
            const isPlayingLoop = isLoopPlaying(loop.id);
            const isArmed = armedLoopId === loop.id;
            const color = loopColor(loop, loopState.loops);

            return (
              <Chip
                key={loop.id}
                label={`${startNum} → ${endNum}`}
                size="small"
                icon={
                  isPlayingLoop ? (
                    // Playing: equalizer bars bounce; hovering shows what a click does (pause)
                    <Box component="span" sx={{ display: 'inline-flex' }}>
                      <Box component="span" className="loop-playing" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </Box>
                      <Pause fontSize="small" className="loop-pause" />
                    </Box>
                  ) : isArmed ? (
                    <Login fontSize="small" />
                  ) : (
                    <LoopIcon fontSize="small" />
                  )
                }
                variant={isActive ? 'filled' : 'outlined'}
                data-loop-chip={loop.id}
                data-armed={isArmed || undefined}
                aria-label={isPlayingLoop ? t('markers.pauseLoop') : t('markers.playLoop')}
                onClick={() => toggleLoopPlayback(loop.id)}
                onDelete={(e) => handleLoopMenuClick(e as React.MouseEvent<HTMLElement>, loop.id)}
                deleteIcon={<MoreVert fontSize="small" />}
                sx={{
                  cursor: 'pointer',
                  // Colored like the loop in the ruler: filled when active, dashed when armed
                  borderColor: color,
                  borderStyle: isArmed ? 'dashed' : 'solid',
                  '& .MuiChip-icon': { color: isActive ? 'inherit' : color },
                  ...(isActive && {
                    bgcolor: color,
                    color: theme.palette.getContrastText(color),
                    '& .MuiChip-deleteIcon': { color: alpha(theme.palette.getContrastText(color), 0.7) },
                  }),
                  '&:hover': {
                    bgcolor: isActive ? alpha(color, 0.8) : alpha(color, 0.12),
                  },
                  '& .loop-playing': {
                    width: 20,
                    height: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    '& span': {
                      width: 3,
                      height: 12,
                      borderRadius: '1.5px',
                      bgcolor: 'currentColor',
                      transformOrigin: 'bottom',
                      animation: 'loop-eq 1s ease-in-out infinite',
                    },
                    '& span:nth-of-type(1)': { animationDelay: '-0.2s' },
                    '& span:nth-of-type(2)': { animationDelay: '-0.6s', animationDuration: '0.9s' },
                    '& span:nth-of-type(3)': { animationDelay: '-0.4s', animationDuration: '1.1s' },
                    '@keyframes loop-eq': {
                      '0%, 100%': { transform: 'scaleY(0.3)' },
                      '50%': { transform: 'scaleY(1)' },
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      '& span': { animation: 'none' },
                      '& span:nth-of-type(1)': { transform: 'scaleY(0.6)' },
                      '& span:nth-of-type(3)': { transform: 'scaleY(0.4)' },
                    },
                  },
                  '& .loop-pause': { display: 'none' },
                  '@media (hover: hover)': {
                    '&:hover .loop-playing': { display: 'none' },
                    '&:hover .loop-pause': { display: 'inline-block' },
                  },
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Marker Menu */}
      <Menu
        anchorEl={menuAnchor?.element}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => menuAnchor && handleLoopEndpoint(menuAnchor.markerId)}>
          <ListItemIcon>
            <LoopIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {loopStartMarker === menuAnchor?.markerId ? t('markers.cancelLoopStart') : 
             loopStartMarker ? t('markers.setLoopEnd') : t('markers.setLoopStart')}
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuAnchor && handleDelete(menuAnchor.markerId)}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('markers.deleteMarker')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Loop Menu */}
      <Menu
        anchorEl={loopMenuAnchor?.element}
        open={Boolean(loopMenuAnchor)}
        onClose={handleLoopMenuClose}
      >
        {loopMenuAnchor && isLoopPlaying(loopMenuAnchor.loopId) && (
          <MenuItem onClick={handleContinueAfterLoop}>
            <ListItemIcon>
              <ArrowForward fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('markers.continueAfterLoop')}</ListItemText>
          </MenuItem>
        )}
        {/* Not for the enabled loop: the playhead is already in it */}
        {loopMenuAnchor && !loopState.loops.find((l) => l.id === loopMenuAnchor.loopId)?.enabled && (
          <MenuItem onClick={() => handleLoopOnEntry(loopMenuAnchor.loopId)} selected={armedLoopId === loopMenuAnchor.loopId}>
            <ListItemIcon>
              <Login fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('markers.loopOnEntry')}</ListItemText>
            {armedLoopId === loopMenuAnchor.loopId && <Check fontSize="small" sx={{ ml: 2 }} />}
          </MenuItem>
        )}
        <MenuItem onClick={() => loopMenuAnchor && handleDeleteLoop(loopMenuAnchor.loopId)}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('markers.deleteLoop')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete All Confirmation Dialog */}
      <Dialog
        open={deleteAllDialogOpen}
        onClose={() => setDeleteAllDialogOpen(false)}
      >
        <DialogTitle>{t('markers.deleteAllConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('markers.deleteAllConfirmMessage', { 
              markerCount: loopState.markers.length, 
              loopCount: loopState.loops.length 
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialogOpen(false)}>
            {t('markers.deleteAllDialogCancel')}
          </Button>
          <Button onClick={handleDeleteAll} color="error" autoFocus>
            {t('markers.deleteAllDialogConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default MarkersPanel;
