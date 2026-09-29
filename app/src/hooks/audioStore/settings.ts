/**
 * Settings and UI preference actions for audioStore
 * Handles waveform display preferences
 */

import type { AudioStore } from '../../types/audio';
import {
  saveWaveformStyle,
  saveWaveformNormalize,
} from './shared';

export const createSettingsActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void) => ({
  setWaveformStyle: (style: 'modern' | 'classic') => {
    set({ waveformStyle: style });
    saveWaveformStyle(style);
  },

  setWaveformNormalize: (normalize: boolean) => {
    set({ waveformNormalize: normalize });
    saveWaveformNormalize(normalize);
  },
});
