/** Confirmation before deleting every marker and loop of the piece (undoable with Ctrl+Z) */

import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';

export default function DeleteAllMarkersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const loopState = useAudioStore((s) => s.loopState);

  const deleteAll = () => {
    const { edit, removeLoop, removeMarker } = useAudioStore.getState();
    // Loops first, then markers: undone at once
    edit(() => {
      loopState.loops.forEach((loop) => removeLoop(loop.id));
      loopState.markers.forEach((marker) => removeMarker(marker.id));
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('markers.deleteAllConfirmTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('markers.deleteAllConfirmMessage', { markerCount: loopState.markers.length, loopCount: loopState.loops.length })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('markers.deleteAllDialogCancel')}</Button>
        <Button onClick={deleteAll} color="error" autoFocus>
          {t('markers.deleteAllDialogConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
