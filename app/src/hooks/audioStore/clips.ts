/**
 * Clip edits (move / trim), undoable (see history.ts).
 * Only the clip window changes: the audio file is never modified.
 */

import type { AudioStore } from '../../types/audio';
import type { ClipGeometry } from '../../timeline/clipEdit';
import { logger } from '../../utils/logger';

const SNAP_KEY = 'timeline-snap';
const EDIT_MODE_KEY = 'timeline-edit-mode';

export const loadSnapEnabled = () => {
  try {
    return localStorage.getItem(SNAP_KEY) !== 'false';
  } catch {
    return true;
  }
};

const saveSnapEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(SNAP_KEY, String(enabled));
  } catch {
    // storage unavailable: not remembered
  }
};

/** Edit mode (drag = move/trim clips) is off by default: drag = scroll */
export const loadEditMode = () => {
  try {
    return localStorage.getItem(EDIT_MODE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const createClipActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  /** Apply a clip edit (recorded for undo) */
  updateClip: (trackId: string, clip: ClipGeometry) => {
    if (!get().tracks.some((t) => t.id === trackId)) return;
    get().edit(() => get().updateTrack(trackId, { clipOffset: clip.offset, trimStart: clip.trimStart, clipDuration: clip.duration }));
    logger.debug(`✂️ Clip ${trackId}: at ${clip.offset.toFixed(3)}s, from ${clip.trimStart.toFixed(3)}s, ${clip.duration.toFixed(3)}s long`);
  },

  setEditMode: (enabled: boolean) => {
    set({ editMode: enabled });
    try {
      localStorage.setItem(EDIT_MODE_KEY, String(enabled));
    } catch {
      // storage unavailable: not remembered
    }
  },

  setSnapEnabled: (enabled: boolean) => {
    set({ snapEnabled: enabled });
    saveSnapEnabled(enabled);
  },
});
