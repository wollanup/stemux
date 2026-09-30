/**
 * Settings and UI preference actions for audioStore
 * Handles waveform display preferences
 */

import type { AudioStore } from '../../types/audio';
import {
  saveWaveformStyle,
  saveWaveformNormalize,
} from './shared';

const LOOPS_PANEL_KEY = 'loops-panel-open';

/** Markers and loops panel shown (strip editable) or hidden (strip read-only); shown by default */
export const loadLoopsPanelOpen = () => {
  try {
    return localStorage.getItem(LOOPS_PANEL_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const createSettingsActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void) => ({
  setWaveformStyle: (style: 'modern' | 'classic') => {
    set({ waveformStyle: style });
    saveWaveformStyle(style);
  },

  setWaveformNormalize: (normalize: boolean) => {
    set({ waveformNormalize: normalize });
    saveWaveformNormalize(normalize);
  },

  setLoopsPanelOpen: (open: boolean) => {
    set({ loopsPanelOpen: open });
    try {
      localStorage.setItem(LOOPS_PANEL_KEY, String(open));
    } catch {
      // storage unavailable: not remembered
    }
  },
});
