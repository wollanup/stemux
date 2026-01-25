import { Box, IconButton, Typography, Chip, Menu, MenuItem, ListItemIcon, ListItemText, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { Close, MoreVert, Loop as LoopIcon, Delete, PlayArrow } from '@mui/icons-material';
import { useAudioStore } from '../hooks/useAudioStore';
import { useState } from 'react';
import {logger} from '../utils/logger';

const MarkersPanel = () => {
  const { loopState, removeMarker, removeLoop, seek, createLoop, setActiveLoop, play } = useAudioStore();
  const [menuAnchor, setMenuAnchor] = useState<{ element: HTMLElement; markerId: string } | null>(null);
  const [loopMenuAnchor, setLoopMenuAnchor] = useState<{ element: HTMLElement; loopId: string } | null>(null);
  const [loopStartMarker, setLoopStartMarker] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  if (loopState.markers.length === 0) return null;

  const handleMarkerClick = (time: number) => {
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

  const handleLoopClick = (loopId: string) => {
    const loop = loopState.loops.find(l => l.id === loopId);
    if (!loop) return;
    
    const startMarker = loopState.markers.find(m => m.id === loop.startMarkerId);
    if (!startMarker) return;
    
    setActiveLoop(loopId);
    seek(startMarker.time);
    play();
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

  const handleDeleteAll = () => {
    // Remove all loops first
    loopState.loops.forEach(loop => removeLoop(loop.id));
    // Then remove all markers
    loopState.markers.forEach(marker => removeMarker(marker.id));
    setDeleteAllDialogOpen(false);
  };

  // TODO: Implement hover sync with CSS classes instead of inline styles
  // Highlight elements in shadow DOM on hover
  // const handleMarkerHover = (markerId: string | null) => {
  //   setHoveredMarkerId(markerId);
  //   
  //   // Find all waveform containers with shadow roots
  //   const containers = document.querySelectorAll('[data-wavesurfer="true"]');
  //   containers.forEach(container => {
  //     const wsElement = Array.from(container.children).find(
  //       child => (child as HTMLElement).shadowRoot
  //     ) as HTMLElement;
  //     
  //     if (wsElement?.shadowRoot) {
  //       const elements = wsElement.shadowRoot.querySelectorAll(`[data-loop-marker="${markerId}"]`);
  //       elements.forEach(el => {
  //         if (markerId) {
  //           (el as HTMLElement).style.filter = 'brightness(1.5) drop-shadow(0 0 8px currentColor)';
  //         } else {
  //           (el as HTMLElement).style.filter = '';
  //         }
  //       });
  //     }
  //   });
  // };

  // const handleLoopHover = (loopId: string | null) => {
  //   setHoveredLoopId(loopId);
  //   
  //   // Find all waveform containers with shadow roots
  //   const containers = document.querySelectorAll('[data-wavesurfer="true"]');
  //   containers.forEach(container => {
  //     const wsElement = Array.from(container.children).find(
  //       child => (child as HTMLElement).shadowRoot
  //     ) as HTMLElement;
  //     
  //     if (wsElement?.shadowRoot) {
  //       const elements = wsElement.shadowRoot.querySelectorAll(`[data-loop-zone="${loopId}"]`);
  //       elements.forEach(el => {
  //         if (loopId) {
  //           (el as HTMLElement).style.filter = 'brightness(1.3)';
  //           (el as HTMLElement).style.transform = 'scaleY(1.05)';
  //         } else {
  //           (el as HTMLElement).style.filter = '';
  //           (el as HTMLElement).style.transform = '';
  //         }
  //       });
  //     }
  //   });
  // };

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
          Repères:
        </Typography>
        {loopState.markers.map((marker, index) => {
          const isInActiveLoop = loopState.loops.find(
            l => l.enabled && (l.startMarkerId === marker.id || l.endMarkerId === marker.id)
          );
          
          const isLoopEndpoint = loopState.loops.some(
            l => l.startMarkerId === marker.id || l.endMarkerId === marker.id
          );

          const isLoopStartSelection = loopStartMarker === marker.id;

          return (
            <Chip
              key={marker.id}
              label={`${index + 1} - ${formatTime(marker.time)}`}
              size="small"
              icon={<PlayArrow fontSize="small" />}
              variant={isLoopEndpoint ? 'outlined' : 'filled'}
              color={isInActiveLoop ? 'primary' : 'default'}
              onClick={() => handleMarkerClick(marker.time)}
              onPointerDown={(e) => handlePointerDown(e, marker.id)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDelete={(e) => handleMenuClick(e as React.MouseEvent<HTMLElement>, marker.id)}
              deleteIcon={<MoreVert fontSize="small" />}
              sx={{
                cursor: 'pointer',
                bgcolor: isLoopStartSelection ? 'primary.main' : undefined,
                color: isLoopStartSelection ? 'primary.contrastText' : undefined,
                '&:hover': {
                  bgcolor: !isLoopEndpoint && isInActiveLoop ? 'primary.dark' : 'action.hover',
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
            Boucles:
          </Typography>
          {loopState.loops.map((loop) => {
            const startNum = getMarkerNumber(loop.startMarkerId);
            const endNum = getMarkerNumber(loop.endMarkerId);
            const isActive = loop.enabled;

            return (
              <Chip
                key={loop.id}
                label={`${startNum} → ${endNum}`}
                size="small"
                icon={<LoopIcon fontSize="small" />}
                color={isActive ? 'primary' : 'default'}
                onClick={() => handleLoopClick(loop.id)}
                onDelete={(e) => handleLoopMenuClick(e as React.MouseEvent<HTMLElement>, loop.id)}
                deleteIcon={<MoreVert fontSize="small" />}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: isActive ? 'primary.dark' : 'action.hover',
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
            {loopStartMarker === menuAnchor?.markerId ? 'Cancel loop start' : 
             loopStartMarker ? 'Set as loop end' : 'Set as loop start'}
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuAnchor && handleDelete(menuAnchor.markerId)}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete marker</ListItemText>
        </MenuItem>
      </Menu>

      {/* Loop Menu */}
      <Menu
        anchorEl={loopMenuAnchor?.element}
        open={Boolean(loopMenuAnchor)}
        onClose={handleLoopMenuClose}
      >
        <MenuItem onClick={() => loopMenuAnchor && handleDeleteLoop(loopMenuAnchor.loopId)}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete loop</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete All Confirmation Dialog */}
      <Dialog
        open={deleteAllDialogOpen}
        onClose={() => setDeleteAllDialogOpen(false)}
      >
        <DialogTitle>Supprimer tous les repères et boucles ?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Cette action supprimera définitivement tous les repères ({loopState.markers.length}) et toutes les boucles ({loopState.loops.length}). Cette action est irréversible.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialogOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleDeleteAll} color="error" autoFocus>
            Supprimer tout
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
