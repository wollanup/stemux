/**
 * Storage utilities for audioStore
 * Handles piece settings persistence and orphaned data cleanup
 */

import type { AudioTrack, PieceSettings, Tempo } from '../../types/audio';
import { NO_PITCH_SHIFT, type PitchShift } from '../../audio/pitch';
import {
  savePieceSettings,
  getAllAudioFiles,
  deleteAudioFile,
  getAllPieces,
  getPieceSettings,
} from '../../utils/indexedDB';
import { logger } from '../../utils/logger';

/** Tempo of the current piece, saved along with the rest (the store registers it) */
let tempoSource: () => Tempo | null = () => null;
export const setTempoSource = (source: () => Tempo | null) => {
  tempoSource = source;
};

/** Pitch shift of the current piece, saved the same way */
let pitchSource: () => PitchShift = () => NO_PITCH_SHIFT;
export const setPitchSource = (source: () => PitchShift) => {
  pitchSource = source;
};

/**
 * Save track settings to piece settings in IndexedDB
 */
export const saveTrackSettingsToPiece = async (
  pieceId: string,
  tracks: AudioTrack[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loopState: any,
  playbackRate: number,
  masterVolume: number
) => {
  const settings: PieceSettings = {
    trackSettings: tracks.map(t => ({
      id: t.id,
      name: t.name,
      volume: t.volume,
      reverb: t.reverb,
      reverbEnabled: t.reverbEnabled,
      isMuted: t.isMuted,
      isSolo: t.isSolo,
      color: t.color,
      isCollapsed: t.isCollapsed,
      height: t.height,
      isRecordable: t.isRecordable,
      clipOffset: t.clipOffset,
      trimStart: t.trimStart,
      clipDuration: t.clipDuration,
    })),
    loopState: {
      markers: loopState.markers,
      loops: loopState.loops,
      activeLoopId: loopState.activeLoopId,
    },
    playbackRate,
    masterVolume,
    tempo: tempoSource(),
    pitch: pitchSource(),
  };
  await savePieceSettings(pieceId, settings);
};

/**
 * Clean orphaned data from IndexedDB
 * Removes audio files and track references that don't exist in pieceSettings
 */
export const cleanOrphanedData = async (currentPieceId: string | null) => {
  if (!currentPieceId) {
    logger.log('🧹 No current piece, skipping cleanup');
    return { filesDeleted: 0, referencesRemoved: 0 };
  }

  logger.log('🧹 Starting orphaned data cleanup...');

  // Get current piece settings (source of truth)
  const pieceSettings = await getPieceSettings(currentPieceId);
  if (!pieceSettings) {
    logger.log('🧹 No piece settings found, skipping cleanup');
    return { filesDeleted: 0, referencesRemoved: 0 };
  }

  const validTrackIds = new Set(pieceSettings.trackSettings.map(t => t.id));
  logger.log(`🧹 Valid track IDs: ${validTrackIds.size}`, Array.from(validTrackIds));

  let filesDeleted = 0;
  let referencesRemoved = 0;

  // 1. Clean orphaned audio files
  const allAudioFiles = await getAllAudioFiles();
  logger.log(`🧹 Total audio files in DB: ${allAudioFiles.length}`);

  for (const file of allAudioFiles) {
    if (!validTrackIds.has(file.id)) {
      logger.log(`🗑️ Deleting orphaned audio file: ${file.id} (${file.file?.name || 'unknown'})`);
      await deleteAudioFile(file.id);
      filesDeleted++;
    }
  }

  // 2. Clean orphaned trackIds from pieces.trackIds
  const allPieces = await getAllPieces();
  for (const piece of allPieces) {
    if (piece.id === currentPieceId && piece.trackIds) {
      const validIds = piece.trackIds.filter(id => validTrackIds.has(id));
      if (validIds.length !== piece.trackIds.length) {
        const removed = piece.trackIds.length - validIds.length;
        logger.log(`🗑️ Removing ${removed} orphaned track references from piece ${piece.id}`);
        referencesRemoved += removed;

        // Update piece with cleaned trackIds
        const { savePiece } = await import('../../utils/indexedDB');
        await savePiece({
          ...piece,
          trackIds: validIds,
        });
      }
    }
  }

  logger.log(`🧹 Cleanup complete: ${filesDeleted} orphaned files deleted, ${referencesRemoved} invalid references removed`);

  return { filesDeleted, referencesRemoved };
};
