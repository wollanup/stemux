/**
 * Piece (project) management actions for audioStore
 * Handles create, load, delete, rename, list operations for pieces
 */

import type { AudioStore, AudioTrack, Piece, PieceWithStats } from '../../types/audio';
import { audioEngine } from '../../audio/AudioEngine';
import { logger } from '../../utils/logger';
import {
  getPiece,
  savePiece,
  deletePiece as deletePieceDB,
  getAllPieces,
  getAllAudioFiles,
  getAudioFileSize,
  deleteAudioFile,
  getPieceSettings,
  savePieceSettings,
  deletePieceSettings,
  clearAllAudioFiles,
  clearAllPieces,
  clearAllPieceSettings,
} from '../../utils/indexedDB';
import { saveCurrentPieceId } from './shared';
import { cleanOrphanedData } from './storage';

export const createPieceActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  createPiece: async (name: string): Promise<string> => {
    const id = `piece-${Date.now()}-${Math.random()}`;
    const piece: Piece = {
      id,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trackIds: [],
    };

    await savePiece(piece);

    // Initialize empty settings
    await savePieceSettings(id, {
      trackSettings: [],
      loopState: { markers: [], loops: [], activeLoopId: null },
      playbackRate: 1.0,
      masterVolume: 1.0,
    });

    set({ currentPieceId: id, currentPieceName: name });
    saveCurrentPieceId(id);

    logger.debug(`🎼 Created piece: ${name} (${id})`);
    return id;
  },

  loadPiece: async (id: string): Promise<void> => {
    const { pause } = get();

    // Pause playback and start the new piece from the beginning
    pause();
    audioEngine.seek(0);

    const piece = await getPiece(id);
    if (!piece) {
      throw new Error(`Piece ${id} not found`);
    }

    const settings = await getPieceSettings(id);
    if (!settings) {
      throw new Error(`Piece settings ${id} not found`);
    }

    // Load audio files
    const allFiles = await getAllAudioFiles();
    const tracksData: AudioTrack[] = [];

    for (const trackId of piece.trackIds) {
      const fileData = allFiles.find(f => f.id === trackId);
      const trackSetting = settings.trackSettings.find(s => s.id === trackId);

      if (trackSetting) {
        // Recordable tracks may not have a file yet
        if (trackSetting.isRecordable) {
          tracksData.push({
            ...trackSetting,
            file: fileData?.file,
            isRecordable: true,
            isArmed: false,
            recordingState: 'idle',
          } as AudioTrack);
        } else if (fileData) {
          // Regular tracks need a file
          tracksData.push({
            ...trackSetting,
            file: fileData.file,
          } as AudioTrack);
        }
      }
    }

    // Update state
    set({
      tracks: tracksData,
      loopState: {
        ...settings.loopState,
      },
      armedLoopId: null,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        playbackRate: settings.playbackRate,
      },
      masterVolume: settings.masterVolume,
      currentPieceId: id,
      currentPieceName: piece.name,
    });

    saveCurrentPieceId(id);
    logger.debug(`🎼 Loaded piece: ${piece.name} (${id})`);
  },

  deletePiece: async (id: string): Promise<void> => {
    const { currentPieceId } = get();

    const piece = await getPiece(id);
    if (!piece) {
      throw new Error(`Piece ${id} not found`);
    }

    // Delete audio files associated with this piece
    await Promise.all(piece.trackIds.map(trackId => deleteAudioFile(trackId)));

    // Delete piece and settings
    await deletePieceDB(id);
    await deletePieceSettings(id);

    // If deleting current piece, clear state
    if (currentPieceId === id) {
      set({
        tracks: [],
        loopState: {
          markers: [],
          loops: [],
          activeLoopId: null,
          },
        playbackState: {
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          playbackRate: 1.0,
        },
        masterVolume: 1.0,
        currentPieceId: null,
        currentPieceName: '',
      });
      saveCurrentPieceId(null);
    }

    logger.debug(`🗑️ Deleted piece: ${id}`);
  },

  renamePiece: async (id: string, name: string): Promise<void> => {
    const piece = await getPiece(id);
    if (!piece) {
      throw new Error(`Piece ${id} not found`);
    }

    piece.name = name;
    piece.updatedAt = Date.now();
    await savePiece(piece);

    // Update current piece name if renaming current piece
    const state = get();
    if (state.currentPieceId === id) {
      set({ currentPieceName: name });
    }

    logger.debug(`✏️ Renamed piece ${id} to: ${name}`);
  },

  listPieces: async (): Promise<PieceWithStats[]> => {
    const pieces = await getAllPieces();
    const piecesWithStats: PieceWithStats[] = [];

    for (const piece of pieces) {
      let totalSize = 0;
      const maxDuration = 0;

      // Calculate size and duration
      for (const trackId of piece.trackIds) {
        try {
          const size = await getAudioFileSize(trackId);
          totalSize += size;
        } catch (err) {
          console.warn(`Failed to get size for track ${trackId}:`, err);
        }
      }

      piecesWithStats.push({
        ...piece,
        duration: maxDuration,
        trackCount: piece.trackIds.length,
        size: totalSize,
      });
    }

    // Sort by most recently updated
    return piecesWithStats.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  getRecentPieces: async (limit: number = 10): Promise<PieceWithStats[]> => {
    const allPieces = await get().listPieces();
    return allPieces.slice(0, limit);
  },

  getCurrentPiece: async (): Promise<PieceWithStats | null> => {
    const { currentPieceId } = get();
    if (!currentPieceId) return null;

    const piece = await getPiece(currentPieceId);
    if (!piece) return null;

    let totalSize = 0;
    for (const trackId of piece.trackIds) {
      try {
        const size = await getAudioFileSize(trackId);
        totalSize += size;
      } catch (err) {
        console.warn(`Failed to get size for track ${trackId}:`, err);
      }
    }

    const { playbackState } = get();

    return {
      ...piece,
      duration: playbackState.duration,
      trackCount: piece.trackIds.length,
      size: totalSize,
    };
  },

  deleteAllPieces: async (): Promise<void> => {
    const { pause } = get();

    pause();

    // Clear all stores
    await clearAllAudioFiles();
    await clearAllPieces();
    await clearAllPieceSettings();

    // Reset state
    set({
      tracks: [],
      loopState: {
        markers: [],
        loops: [],
        activeLoopId: null,
      },
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        playbackRate: 1.0,
      },
      masterVolume: 1.0,
      currentPieceId: null,
      currentPieceName: '',
    });

    saveCurrentPieceId(null);
    logger.debug('🗑️ Deleted all pieces');
  },

  getTotalStorageSize: async (): Promise<number> => {
    const pieces = await getAllPieces();
    let totalSize = 0;

    for (const piece of pieces) {
      for (const trackId of piece.trackIds) {
        try {
          const size = await getAudioFileSize(trackId);
          totalSize += size;
        } catch (err) {
          console.warn(`Failed to get size for track ${trackId}:`, err);
        }
      }
    }

    return totalSize;
  },

  // Re-export cleanOrphanedData from storage module (wrapper to match signature)
  cleanOrphanedData: async () => {
    const { currentPieceId } = get();
    return cleanOrphanedData(currentPieceId);
  },
});
