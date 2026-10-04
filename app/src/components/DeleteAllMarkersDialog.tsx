/** Confirmation before deleting every marker and loop of the piece (undoable with Ctrl+Z) */

import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import ConfirmDialog from './ConfirmDialog';

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
    <ConfirmDialog
      opened={open}
      onClose={onClose}
      onConfirm={deleteAll}
      title={t('markers.deleteAllConfirmTitle')}
      message={t('markers.deleteAllConfirmMessage', { markerCount: loopState.markers.length, loopCount: loopState.loops.length })}
      cancelLabel={t('markers.deleteAllDialogCancel')}
      confirmLabel={t('markers.deleteAllDialogConfirm')}
    />
  );
}
