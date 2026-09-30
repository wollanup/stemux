/**
 * Tempo of the piece (saved with it) and ruler display (remembered in this
 * browser). Tempo changes are settings, not undoable edits.
 */

import type { AudioStore, Tempo } from '../../types/audio';
import { saveTrackSettingsToPiece } from './storage';

const RULER_MODE_KEY = 'timeline-ruler-mode';

export const loadRulerMode = (): 'time' | 'bars' => {
  try {
    return localStorage.getItem(RULER_MODE_KEY) === 'bars' ? 'bars' : 'time';
  } catch {
    return 'time';
  }
};

export const createTempoActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  setTempo: (tempo: Tempo | null) => {
    set({ tempo });
    const { currentPieceId, tracks, loopState, playbackState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(currentPieceId, tracks, loopState, playbackState.playbackRate, masterVolume)
        .catch((err) => console.error('Failed to save tempo:', err));
    }
  },

  setRulerMode: (mode: 'time' | 'bars') => {
    set({ rulerMode: mode });
    try {
      localStorage.setItem(RULER_MODE_KEY, mode);
    } catch {
      // storage unavailable: not remembered
    }
  },
});
