/**
 * Playback control actions for audioStore
 * Handles play, pause, seek, playback rate, and master volume
 *
 * All audio goes through the shared AudioEngine (one AudioContext clock).
 */

import type { AudioStore } from '../../types/audio';
import { logger } from '../../utils/logger';
import { audioEngine } from '../../audio/AudioEngine';
import { saveTrackSettingsToPiece } from './storage';

export const createPlaybackActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  play: () => {
    const { tracks, playbackState } = get();
    if (playbackState.isPlaying) return;

    const armedTrack = tracks.find((t) => t.isArmed && t.isRecordable);

    // Restart from the beginning if the transport reached the end
    const duration = audioEngine.getDuration();
    if (duration > 0 && audioEngine.getCurrentTime() >= duration && !armedTrack) {
      audioEngine.seek(0);
    }

    const start = audioEngine.play();
    logger.debug(`🎵 PLAY at ctx=${start.ctxTime.toFixed(4)}s, pos=${start.pos.toFixed(4)}s`);

    // Recording starts on the very same AudioContext frame as playback
    if (armedTrack) {
      get().startRecording(armedTrack.id, start.ctxTime);
    }

    set((state: AudioStore) => ({
      playbackState: { ...state.playbackState, isPlaying: true },
    }));
  },

  pause: () => {
    const { tracks } = get();

    // Stop recording if any track is recording (stop frame = now)
    const recordingTrack = tracks.find((t) => t.recordingState === 'recording');
    if (recordingTrack) {
      void get().stopRecording(recordingTrack.id);
    }

    // Disarm any armed track
    const armedTrack = get().tracks.find((t) => t.isArmed);
    if (armedTrack) {
      get().toggleRecordArm(armedTrack.id); // Will disarm it
    }

    audioEngine.pause();

    set((state: AudioStore) => ({
      playbackState: {
        ...state.playbackState,
        isPlaying: false,
        currentTime: audioEngine.getCurrentTime(),
      },
    }));
  },

  seek: (time: number) => {
    const state = get();

    // Moving the playhead while recording would desync the take
    if (state.tracks.some((t) => t.recordingState === 'recording')) {
      logger.debug('🚫 Seek ignored while recording');
      return;
    }

    const preserveLoop = state._preserveLoopOnNextSeek || false;

    // Check if seeking inside the active loop (if any)
    let seekingInsideActiveLoop = false;
    if (!preserveLoop && state.loopState.activeLoopId) {
      const activeLoop = state.loopState.loops.find(l => l.id === state.loopState.activeLoopId);
      if (activeLoop) {
        const startMarker = state.loopState.markers.find(m => m.id === activeLoop.startMarkerId);
        const endMarker = state.loopState.markers.find(m => m.id === activeLoop.endMarkerId);
        if (startMarker && endMarker) {
          seekingInsideActiveLoop = time >= startMarker.time && time <= endMarker.time;
        }
      }
    }

    set((state: AudioStore) => {
      const updates: Partial<AudioStore> = {
        playbackState: { ...state.playbackState, currentTime: time },
        _preserveLoopOnNextSeek: false,
      };

      // Disable active loop only if seeking outside of it
      if (!preserveLoop && !seekingInsideActiveLoop && state.loopState.activeLoopId) {
        logger.debug('🔓 Disabling loop (seeking outside loop)');
        updates.loopState = {
          ...state.loopState,
          activeLoopId: null,
          loops: state.loopState.loops.map(l => ({ ...l, enabled: false }))
        };

        // Save to piece
        if (state.currentPieceId) {
          saveTrackSettingsToPiece(
            state.currentPieceId,
            state.tracks,
            updates.loopState,
            state.playbackState.playbackRate,
            state.masterVolume
          ).catch(err => console.error('Failed to save loop state:', err));
        }
      } else if (seekingInsideActiveLoop) {
        logger.debug('✅ Keeping loop active (seeking inside loop)');
      }

      return updates;
    });

    // Every track follows: they all share the engine transport
    audioEngine.seek(time);
  },

  setPlaybackRate: (rate: number) => {
    const { tracks } = get();

    // A take recorded at another speed could not be aligned
    if (tracks.some((t) => t.recordingState === 'recording')) {
      logger.debug('🚫 Playback rate change ignored while recording');
      return;
    }
    const armedTrack = tracks.find((t) => t.isArmed);
    if (armedTrack && rate !== 1) {
      get().toggleRecordArm(armedTrack.id); // Disarm: recording requires 1x
    }

    // The engine follows playbackState.playbackRate (see useAudioStore)
    set((state: AudioStore) => ({
      playbackState: { ...state.playbackState, playbackRate: rate },
    }));

    // Save to piece
    const { currentPieceId, loopState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        get().tracks,
        loopState,
        rate,
        masterVolume
      ).catch(err => console.error('Failed to save playback rate:', err));
    }
  },

  setMasterVolume: (volume: number) => {
    set({ masterVolume: volume });

    // Save to piece
    const { currentPieceId, tracks, loopState, playbackState } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        loopState,
        playbackState.playbackRate,
        volume
      ).catch(err => console.error('Failed to save master volume:', err));
    }
  },
});
