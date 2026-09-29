/**
 * Recording management actions for audioStore
 * Handles recordable tracks, arm/disarm, start/stop recording, save/clear
 */

import type { AudioStore, AudioTrack } from '../../types/audio';
import { logger } from '../../utils/logger';
import {
  saveAudioFile,
  deleteAudioFile,
  getPiece,
  savePiece,
} from '../../utils/indexedDB';
import { COLORS, generatePieceName, enqueueTrackAddition } from './shared';
import { saveTrackSettingsToPiece } from './storage';
import { audioEngine } from '../../audio/AudioEngine';
import { openMic, closeMic, getMic, trackStop } from '../../audio/micSession';
import { getRecordingLatency } from '../../audio/latency';
import { buildTake } from '../../utils/audioUtils';
import i18n from '../../i18n/config';

const getMicErrorMessage = (error: Error) => {
  if (error.name === 'NotAllowedError') {
    return `${i18n.t('recording.errors.permissionDenied')}\n\n${i18n.t('recording.errors.checkPermissions')}`;
  }
  if (error.name === 'NotFoundError') return i18n.t('recording.errors.noMicrophone');
  if (error.name === 'NotReadableError') return i18n.t('recording.errors.microphoneInUse');
  return i18n.t('recording.errors.unknown');
};

export const createRecordingActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  addRecordableTrack: () => enqueueTrackAddition(async () => {
    const { pause, currentPieceId, createPiece } = get();

    if (get().tracks.length >= 8) {
      alert('Maximum 8 tracks allowed');
      return;
    }

    // Create piece if none exists
    let pieceId = currentPieceId;
    if (!pieceId) {
      pieceId = await createPiece(generatePieceName());
    }

    // Pause playback (but keep cursor position)
    pause();
    // DON'T seek(0) - keep current position!

    // Generate name with date/time
    const name = generatePieceName();
    const id = `track-${Date.now()}-${Math.random()}`;

    set((state: AudioStore) => {
      const newTrack: AudioTrack = {
        id,
        name,
        volume: 0.8, // Default volume for recordings
        isMuted: false,
        isSolo: false,
        color: COLORS[state.tracks.length % COLORS.length],
        isRecordable: true,
        isArmed: false,
        recordingState: 'idle',
      };
      return { tracks: [...state.tracks, newTrack] };
    });

    // Save settings to piece
    const state = get();
    await saveTrackSettingsToPiece(
      pieceId,
      state.tracks,
      state.loopState,
      state.playbackState.playbackRate,
      state.masterVolume
    );

    // Update piece
    const piece = await getPiece(pieceId);
    if (piece) {
      piece.updatedAt = Date.now();
      await savePiece(piece);
    }

    logger.debug('🎙️ Added recordable track:', name);
  }),

  toggleRecordArm: (trackId: string) => {
    const { tracks, loopState, playbackState } = get();

    const track = tracks.find((t) => t.id === trackId);
    if (!track || !track.isRecordable) return;

    const newArmedState = !track.isArmed;

    // A take recorded at another speed could not be aligned with the piece
    if (newArmedState && playbackState.playbackRate !== 1) return;

    // If arming, save and disable loop
    if (newArmedState && loopState.activeLoopId !== null) {
      set({
        loopBackup: { activeLoopId: loopState.activeLoopId },
        loopState: { ...loopState, activeLoopId: null },
      });
    }

    // If disarming, restore loop
    if (!newArmedState) {
      const { loopBackup } = get();
      if (loopBackup) {
        set({
          loopState: { ...get().loopState, activeLoopId: loopBackup.activeLoopId },
          loopBackup: null,
        });
      }
    }

    // Update tracks (exclusive arm). Keep the state of a take being saved.
    const updatedTracks = get().tracks.map((t) => ({
      ...t,
      isArmed: t.id === trackId ? newArmedState : false,
      recordingState:
        t.recordingState === 'stopped'
          ? ('stopped' as const)
          : t.id === trackId && newArmedState ? ('armed' as const) : ('idle' as const),
    }));

    set({ tracks: updatedTracks });
    logger.debug(`🎙️ ${newArmedState ? 'Armed' : 'Disarmed'} track:`, track.name);

    if (newArmedState) {
      // Open the mic NOW (permission, device start-up) so play starts instantly
      openMic().catch((error: Error) => {
        if (error.message === 'mic-closed') return;
        console.error('Failed to open microphone:', error);
        alert(getMicErrorMessage(error));
        const current = get().tracks.find((t) => t.id === trackId);
        if (current?.isArmed) get().toggleRecordArm(trackId);
      });
    } else {
      closeMic();
    }
  },

  startRecording: async (trackId: string, ctxTime: number) => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track || !track.isArmed) return;

    let recorder;
    try {
      recorder = await openMic();
    } catch {
      return; // error already reported when arming
    }
    const ctx = audioEngine.getContext();
    // Normally ctxTime (the frame where playback starts). If the mic was still
    // opening, start a bit later: the transport position is known for any time.
    const startTime = Math.max(ctxTime, ctx.currentTime + 0.02);
    if (!get().playbackState.isPlaying || !audioEngine.isPlaying()) return;
    const recordingStartOffset = audioEngine.positionAt(startTime);
    recorder.start(startTime);

    logger.log(`⏱️ Recording starts at ctx=${startTime.toFixed(6)}s = piece position ${recordingStartOffset.toFixed(6)}s`);

    set((state: AudioStore) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, recordingState: 'recording' as const, recordingStartOffset }
          : t
      ),
    }));
  },

  stopRecording: async (trackId: string) => {
    const track = get().tracks.find((t) => t.id === trackId);
    const recorder = getMic();
    if (!track || !recorder) return;

    set((state: AudioStore) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, recordingState: 'stopped' as const } : t
      ),
    }));

    const ctx = audioEngine.getContext();
    const take = await trackStop(recorder.stop(ctx.currentTime));

    if (take.samples.length === 0) {
      logger.warn('🎙️ Empty take, nothing saved');
      set((state: AudioStore) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId ? { ...t, recordingState: 'idle' as const } : t
        ),
      }));
      return;
    }

    // What you heard was late by the output latency, and the mic signal reaches
    // the browser late by the input latency: shift the take earlier by both.
    const latency = getRecordingLatency(recorder);
    const startOffset = track.recordingStartOffset ?? 0;
    const timelineOffset = startOffset - latency;

    logger.log(`⏱️ Recording END: ${(take.samples.length / take.sampleRate).toFixed(3)}s captured`);
    logger.log(`  - Started at piece position: ${startOffset.toFixed(6)}s`);
    logger.log(`  - Latency compensation: ${(latency * 1000).toFixed(1)}ms`);
    logger.log(`  - Take placed at: ${timelineOffset.toFixed(6)}s`);

    const { blob, clipOffset } = buildTake(take.samples, take.sampleRate, timelineOffset);
    await get().saveRecording(trackId, blob, clipOffset);
  },

  // Called when the take has been assembled
  saveRecording: async (trackId: string, blob: Blob, clipOffset = 0) => {
    const { currentPieceId, loopState, playbackState, masterVolume, tracks } = get();

    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // Save the recording start offset to seek back to it
    const recordingStartOffset = track.recordingStartOffset || 0;

    // Create File from blob
    const fileName = `${track.name}.wav`;
    const file = new File([blob], fileName, { type: 'audio/wav' });

    // Save to IndexedDB
    try {
      await saveAudioFile(trackId, file);

      // Update piece
      if (currentPieceId) {
        const piece = await getPiece(currentPieceId);
        if (piece && !piece.trackIds.includes(trackId)) {
          piece.trackIds = [...piece.trackIds, trackId];
          piece.updatedAt = Date.now();
          await savePiece(piece);
        }

        // Save piece settings with updated track
        const updatedTracks = get().tracks.map((t) =>
          t.id === trackId
            ? { ...t, recordedBlob: blob, file, clipOffset, recordingState: 'stopped' as const }
            : t
        );

        await saveTrackSettingsToPiece(
          currentPieceId,
          updatedTracks,
          loopState,
          playbackState.playbackRate,
          masterVolume
        );
      }

      logger.debug('🎙️ Recording saved to IndexedDB:', blob.size, 'bytes');

      // The track now has a clip placed at clipOffset on the timeline
      set((state: AudioStore) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, recordedBlob: blob, file, clipOffset, recordingState: 'stopped' as const }
            : t
        ),
      }));

      // Go back to where the take started, ready to listen to it
      get().seek(recordingStartOffset);

    } catch (error) {
      console.error('Failed to save recording:', error);
    }
  },

  clearRecording: async (trackId: string) => {
    const { currentPieceId, loopState, playbackState, masterVolume, tracks } = get();

    const track = tracks.find(t => t.id === trackId);
    if (!track || !track.isRecordable) return;

    try {
      // Delete audio file from IndexedDB
      await deleteAudioFile(trackId);

      // Update piece to remove trackId (if exists)
      if (currentPieceId) {
        const piece = await getPiece(currentPieceId);
        if (piece && piece.trackIds.includes(trackId)) {
          piece.trackIds = piece.trackIds.filter(id => id !== trackId);
          piece.updatedAt = Date.now();
          await savePiece(piece);
        }

        // Save piece settings (track remains but without file)
        const updatedTracks = tracks.map((t) =>
          t.id === trackId
            ? { ...t, recordedBlob: undefined, file: undefined, clipOffset: undefined, recordingState: 'idle' as const }
            : t
        );

        await saveTrackSettingsToPiece(
          currentPieceId,
          updatedTracks,
          loopState,
          playbackState.playbackRate,
          masterVolume
        );
      }

      logger.debug('🗑️ Cleared recording for track:', trackId);

      // Update state
      set((state: AudioStore) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, recordedBlob: undefined, file: undefined, clipOffset: undefined, recordingState: 'idle' as const }
            : t
        ),
      }));
    } catch (error) {
      console.error('Failed to clear recording:', error);
    }
  },
});
