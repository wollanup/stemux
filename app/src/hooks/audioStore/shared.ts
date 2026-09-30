/**
 * Shared utilities and constants for audioStore
 */

import { TRACK_COLORS } from '../../utils/colors';

// Track colors palette
export const COLORS = TRACK_COLORS;

// Serializes track additions: callers fire addTrack() for several files at once
// without awaiting, and each addition may create the piece and does a
// read-modify-write of piece.trackIds, so they must not interleave
let trackAdditionQueue: Promise<unknown> = Promise.resolve();
export const enqueueTrackAddition = <T>(task: () => Promise<T>): Promise<T> => {
  const result = trackAdditionQueue.then(task);
  trackAdditionQueue = result.catch(() => {});
  return result;
};

// Generate piece name from date/time
export const generatePieceName = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}`;
};

// LocalStorage helpers
export const loadCurrentPieceId = () => {
  return localStorage.getItem('current-piece-id');
};

export const saveCurrentPieceId = (id: string | null) => {
  if (id) {
    localStorage.setItem('current-piece-id', id);
  } else {
    localStorage.removeItem('current-piece-id');
  }
};

// Legacy loaders for migration
export const loadTrackSettings = () => {
  const stored = localStorage.getItem('practice-tracks-settings');
  return stored ? JSON.parse(stored) : [];
};

export const loadPlaybackRate = () => {
  const stored = localStorage.getItem('practice-tracks-playback-rate');
  return stored ? parseFloat(stored) : 1.0;
};

export const loadMasterVolume = () => {
  const stored = localStorage.getItem('practice-tracks-master-volume');
  return stored ? parseFloat(stored) : 1.0;
};

export const loadLoopV2State = () => {
  const stored = localStorage.getItem('practice-tracks-loop-v2');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('⚠️ Failed to parse loop v2 state:', e);
    }
  }
  return {
    markers: [],
    loops: [],
    activeLoopId: null,
  };
};

export const loadWaveformStyle = () => {
  const stored = localStorage.getItem('waveform-style');
  return stored || 'modern';
};

export const saveWaveformStyle = (style: string) => {
  localStorage.setItem('waveform-style', style);
};

export const loadWaveformNormalize = () => {
  const stored = localStorage.getItem('waveform-normalize');
  return stored ? stored === 'true' : false;
};

export const saveWaveformNormalize = (normalize: boolean) => {
  localStorage.setItem('waveform-normalize', normalize.toString());
};
