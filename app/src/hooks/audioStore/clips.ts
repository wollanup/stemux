/**
 * Clip edits (move / trim) with undo & redo.
 * Only the clip window changes: the audio file is never modified.
 */

import type { AudioStore } from '../../types/audio';
import type { ClipGeometry } from '../../timeline/clipEdit';
import { logger } from '../../utils/logger';

export interface ClipEdit {
  trackId: string;
  before: ClipGeometry;
  after: ClipGeometry;
}

const HISTORY_LIMIT = 100;
const SNAP_KEY = 'timeline-snap';

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

/** Last edit whose track still exists (tracks deleted since are skipped) */
const lastEditIndex = (edits: ClipEdit[], trackIds: Set<string>) => {
  for (let i = edits.length - 1; i >= 0; i--) {
    if (trackIds.has(edits[i].trackId)) return i;
  }
  return -1;
};

const toTrackFields = (clip: ClipGeometry) => ({
  clipOffset: clip.offset,
  trimStart: clip.trimStart,
  clipDuration: clip.duration,
});

export const createClipActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  /** Apply a clip edit and record it for undo */
  updateClip: (trackId: string, before: ClipGeometry, after: ClipGeometry) => {
    if (!get().tracks.some((t) => t.id === trackId)) return;
    get().updateTrack(trackId, toTrackFields(after));
    set((state: AudioStore) => ({
      clipUndo: [...state.clipUndo, { trackId, before, after }].slice(-HISTORY_LIMIT),
      clipRedo: [],
    }));
    logger.debug(`✂️ Clip ${trackId}: at ${after.offset.toFixed(3)}s, from ${after.trimStart.toFixed(3)}s, ${after.duration.toFixed(3)}s long`);
  },

  undoClipEdit: () => {
    const { clipUndo, tracks } = get();
    const index = lastEditIndex(clipUndo, new Set(tracks.map((t) => t.id)));
    if (index < 0) return;
    const edit = clipUndo[index];
    get().updateTrack(edit.trackId, toTrackFields(edit.before));
    set((state: AudioStore) => ({
      clipUndo: state.clipUndo.slice(0, index),
      clipRedo: [...state.clipRedo, edit],
    }));
  },

  redoClipEdit: () => {
    const { clipRedo, tracks } = get();
    const index = lastEditIndex(clipRedo, new Set(tracks.map((t) => t.id)));
    if (index < 0) return;
    const edit = clipRedo[index];
    get().updateTrack(edit.trackId, toTrackFields(edit.after));
    set((state: AudioStore) => ({
      clipRedo: state.clipRedo.slice(0, index),
      clipUndo: [...state.clipUndo, edit],
    }));
  },

  setSnapEnabled: (enabled: boolean) => {
    set({ snapEnabled: enabled });
    saveSnapEnabled(enabled);
  },
});
