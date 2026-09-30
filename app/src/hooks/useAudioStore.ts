/**
 * Main audio store - orchestrates all audio state management modules
 * Refactored into modular structure for better maintainability
 */

import { create } from 'zustand';
import type { AudioStore } from '../types/audio';
import {
  getAllPieces,
  getAllAudioFiles,
  getPiece,
  savePiece,
  savePieceSettings,
} from '../utils/indexedDB';
import { logger } from '../utils/logger';
import {
  loadPlaybackRate,
  loadMasterVolume,
  loadLoopV2State,
  loadWaveformStyle,
  loadWaveformNormalize,
  loadCurrentPieceId,
  loadTrackSettings,
  generatePieceName,
  COLORS,
} from './audioStore/shared';
import { audioEngine } from '../audio/AudioEngine';
import { setPlaybackTime } from './usePlaybackTime';
import { createPlaybackActions } from './audioStore/playback';
import { createTrackActions } from './audioStore/tracks';
import { createLoopActions } from './audioStore/loops';
import { createRecordingActions } from './audioStore/recording';
import { createPieceActions } from './audioStore/pieces';
import { createSettingsActions } from './audioStore/settings';
import { createClipActions, loadSnapEnabled } from './audioStore/clips';
import { createHistoryActions } from './audioStore/history';

// Re-export for backwards compatibility with existing code
export { loadTrackSettings } from './audioStore/shared';


export const useAudioStore = create<AudioStore>((set, get) => ({
  // Initial state
  tracks: [],
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: loadPlaybackRate(),
  },
  loopState: {
    ...loadLoopV2State(),
  },
  masterVolume: loadMasterVolume(),
  zoomLevel: 0,
  waveformStyle: loadWaveformStyle() as 'modern' | 'classic',
  waveformNormalize: loadWaveformNormalize(),
  currentPieceId: loadCurrentPieceId(),
  currentPieceName: '',

  // Recording state
  isRecordingSupported: typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function',
  loopBackup: null,
  armedLoopId: null,

  // Clip editing
  snapEnabled: loadSnapEnabled(),
  undoStack: [],
  redoStack: [],

  // Compose all action modules
  ...createPlaybackActions(set, get),
  ...createTrackActions(set, get),
  ...createLoopActions(set, get),
  ...createRecordingActions(set, get),
  ...createPieceActions(set, get),
  ...createSettingsActions(set),
  ...createClipActions(set, get),
  ...createHistoryActions(set, get),
}));

// Function to restore tracks from IndexedDB on app init
export const restoreTracks = async () => {
  try {
    const state = useAudioStore.getState();

    state.initAudioContext();

    // Check if pieces exist
    const pieces = await getAllPieces();
    
    if (pieces.length === 0) {
      // Migration: Check for legacy localStorage data
      const trackSettings = loadTrackSettings();
      const storedFiles = await getAllAudioFiles();
      
      if (storedFiles.length > 0) {
        // Migrate legacy data to a new piece
        logger.debug('🔄 Migrating legacy data to new piece system');
        
        const pieceName = generatePieceName();
        const pieceId = await state.createPiece(pieceName);
        
        // Create piece with existing track IDs
        const piece = await getPiece(pieceId);
        if (piece) {
          piece.trackIds = storedFiles.map(f => f.id);
          piece.updatedAt = Date.now();
          await savePiece(piece);
        }
        
        // Migrate settings
        const loopState = loadLoopV2State();
        await savePieceSettings(pieceId, {
          trackSettings: trackSettings.length > 0 ? trackSettings : storedFiles.map((f, idx) => ({
            id: f.id,
            name: f.file.name,
            volume: 0.8,
            isMuted: false,
            isSolo: false,
            color: COLORS[idx % COLORS.length],
          })),
          loopState: {
            markers: loopState.markers || [],
            loops: loopState.loops || [],
            activeLoopId: loopState.activeLoopId || null,
          },
          playbackRate: loadPlaybackRate(),
          masterVolume: loadMasterVolume(),
        });
        
        // Load the migrated piece
        await state.loadPiece(pieceId);
        
        logger.debug('✅ Migration complete');
        return;
      }
      
      // No data to restore
      return;
    }

    // Load current piece or first piece
    let currentPieceId = state.currentPieceId;
    
    if (!currentPieceId || !pieces.find(p => p.id === currentPieceId)) {
      // Load most recently updated piece
      const sortedPieces = pieces.sort((a, b) => b.updatedAt - a.updatedAt);
      currentPieceId = sortedPieces[0].id;
    }

    if (currentPieceId) {
      await state.loadPiece(currentPieceId);
    }
  } catch (error) {
    console.error('Failed to restore tracks:', error);
  }
};

// ─── Store → engine synchronisation ─────────────────────────────────────────

/** Effective gain of every track (volume, mute, solo) and master volume */
const syncEngineMix = (state: AudioStore) => {
  const hasSoloedTracks = state.tracks.some((t) => t.isSolo);
  state.tracks.forEach((t) => {
    const muted = t.isMuted || (hasSoloedTracks && !t.isSolo);
    audioEngine.setTrackGain(t.id, muted ? 0 : t.volume);
  });
  audioEngine.setMasterVolume(state.masterVolume);
};

/** Active loop region, handled sample-accurately by the engine */
const syncEngineLoop = (state: AudioStore) => {
  const { loopState } = state;
  const activeLoop = loopState.activeLoopId
    ? loopState.loops.find((l) => l.id === loopState.activeLoopId && l.enabled)
    : undefined;
  const start = activeLoop && loopState.markers.find((m) => m.id === activeLoop.startMarkerId);
  const end = activeLoop && loopState.markers.find((m) => m.id === activeLoop.endMarkerId);
  audioEngine.setLoop(start && end ? { start: Math.min(start.time, end.time), end: Math.max(start.time, end.time) } : null);
};

useAudioStore.subscribe((state, prev) => {
  if (state.tracks !== prev.tracks || state.masterVolume !== prev.masterVolume) {
    syncEngineMix(state);
  }
  if (state.loopState !== prev.loopState) {
    syncEngineLoop(state);
  }
  if (state.playbackState.playbackRate !== prev.playbackState.playbackRate) {
    void audioEngine.setPlaybackRate(state.playbackState.playbackRate);
  }
});
syncEngineMix(useAudioStore.getState());
syncEngineLoop(useAudioStore.getState());
void audioEngine.setPlaybackRate(useAudioStore.getState().playbackState.playbackRate);

audioEngine.on('timeupdate', () => {
  const time = audioEngine.getCurrentTime();
  setPlaybackTime(time);
  if (audioEngine.isPlaying()) useAudioStore.getState().enterArmedLoop(time);
});

audioEngine.on('durationchange', () => {
  const duration = audioEngine.getDuration();
  if (useAudioStore.getState().playbackState.duration !== duration) {
    useAudioStore.setState((state) => ({
      playbackState: { ...state.playbackState, duration },
    }));
  }
});

// End of the piece: stop and go back to the start
audioEngine.on('ended', () => {
  const { tracks } = useAudioStore.getState();
  // Recording may go on past the end of the existing tracks
  if (tracks.some((t) => t.recordingState === 'recording')) return;
  logger.debug('🏁 All tracks finished playing');
  const { pause, seek } = useAudioStore.getState();
  pause();
  seek(0);
});
