/**
 * Loop and marker management actions for audioStore
 * Handles markers (add/remove/update) and loops (create/remove/toggle)
 */

import type { AudioStore } from '../../types/audio';
import { logger } from '../../utils/logger';
import { saveTrackSettingsToPiece } from './storage';

export const createLoopActions = (set: (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void, get: () => AudioStore) => ({
  addMarker: (time: number, label?: string) => {
    const { loopState, playbackState, currentPieceId, tracks, masterVolume } = get();

    // Limit markers
    if (loopState.markers.length >= 20) {
      console.warn('⚠️ Maximum 20 markers reached');
      return '';
    }

    const id = `marker-${Date.now()}-${Math.random()}`;
    const newMarker: {
      id: string;
      time: number;
      createdAt: number;
      label?: string;
    } = {
      id,
      time: Math.max(0, Math.min(time, playbackState.duration)),
      createdAt: Date.now(),
      label,
    };

    const newMarkers = [...loopState.markers, newMarker]
      .sort((a, b) => a.time - b.time);

    logger.debug(`📍 Created marker #${newMarkers.length} at ${newMarker.time.toFixed(2)}s`);

    const newLoopState = {
      ...loopState,
      markers: newMarkers,
    };

    set({ loopState: newLoopState });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save marker:', err));
    }

    return id;
  },

  removeMarker: (id: string) => {
    const { loopState, currentPieceId, tracks, playbackState, masterVolume } = get();

    // Remove loops using this marker
    const loopsToRemove = loopState.loops.filter(
      loop => loop.startMarkerId === id || loop.endMarkerId === id
    );

    loopsToRemove.forEach(loop => {
      logger.debug(`🗑️ Removing loop ${loop.id} (uses deleted marker)`);
    });

    const newMarkers = loopState.markers.filter(m => m.id !== id);
    const newLoops = loopState.loops.filter(
      loop => loop.startMarkerId !== id && loop.endMarkerId !== id
    );

    logger.debug(`📍 Removed marker ${id}`);

    const newLoopState = {
      ...loopState,
      markers: newMarkers,
      loops: newLoops,
      activeLoopId: loopsToRemove.some(l => l.id === loopState.activeLoopId)
        ? null
        : loopState.activeLoopId,
    };

    set({ loopState: newLoopState });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save after marker removal:', err));
    }
  },

  updateMarkerTime: (id: string, time: number) => {
    const { loopState, playbackState, currentPieceId, tracks, masterVolume } = get();
    const newMarkers = loopState.markers.map(m =>
      m.id === id
        ? { ...m, time: Math.max(0, Math.min(time, playbackState.duration)) }
        : m
    ).sort((a, b) => a.time - b.time);

    logger.debug(`📍 Updated marker ${id} to ${time.toFixed(2)}s`);

    const newLoopState = {
      ...loopState,
      markers: newMarkers,
    };

    set({ loopState: newLoopState });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save marker time:', err));
    }
  },

  createLoop: (startMarkerId: string, endMarkerId: string) => {
    const { loopState, currentPieceId, tracks, playbackState, masterVolume } = get();

    // Limit loops
    if (loopState.loops.length >= 10) {
      console.warn('⚠️ Maximum 10 loops reached');
      return '';
    }

    const startMarker = loopState.markers.find(m => m.id === startMarkerId);
    const endMarker = loopState.markers.find(m => m.id === endMarkerId);

    if (!startMarker || !endMarker) {
      console.error('❌ Invalid marker IDs');
      return '';
    }

    // Ensure start < end
    const [start, end] = startMarker.time < endMarker.time
      ? [startMarkerId, endMarkerId]
      : [endMarkerId, startMarkerId];

    const id = `loop-${Date.now()}-${Math.random()}`;
    const newLoop: {
      id: string;
      startMarkerId: string;
      endMarkerId: string;
      enabled: boolean;
      createdAt: number;
    } = {
      id,
      startMarkerId: start,
      endMarkerId: end,
      enabled: false,
      createdAt: Date.now(),
    };

    logger.debug(`🔁 Created loop ${id} from ${startMarker.time.toFixed(2)}s to ${endMarker.time.toFixed(2)}s`);

    const newLoopState = {
      ...loopState,
      loops: [...loopState.loops, newLoop],
    };

    set({ loopState: newLoopState });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save loop:', err));
    }

    return id;
  },

  removeLoop: (id: string) => {
    const { loopState, currentPieceId, tracks, playbackState, masterVolume } = get();
    const newLoops = loopState.loops.filter(l => l.id !== id);

    logger.debug(`🗑️ Removed loop ${id}`);

    const newLoopState = {
      ...loopState,
      loops: newLoops,
      activeLoopId: loopState.activeLoopId === id ? null : loopState.activeLoopId,
    };

    set({ loopState: newLoopState });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save after loop removal:', err));
    }
  },

  toggleLoopById: (id: string) => {
    const { loopState, seek, currentPieceId, tracks, playbackState, masterVolume } = get();
    const loop = loopState.loops.find(l => l.id === id);

    if (!loop) return;

    const newEnabled = !loop.enabled;

    // Disable all other loops if enabling this one
    const newLoops = loopState.loops.map(l =>
      l.id === id
        ? { ...l, enabled: newEnabled }
        : { ...l, enabled: false }
    );

    logger.debug(`🔁 Loop ${id} ${newEnabled ? 'ENABLED' : 'DISABLED'}`);

    const newLoopState = {
      ...loopState,
      loops: newLoops,
      activeLoopId: newEnabled ? id : null,
    };

    set({ loopState: newLoopState });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save loop toggle:', err));
    }

    // If enabling, seek to the start of the loop
    if (newEnabled) {
      const startMarker = loopState.markers.find(m => m.id === loop.startMarkerId);
      if (startMarker) {
        logger.debug(`⏩ Seeking to loop start: ${startMarker.time.toFixed(2)}s`);
        // Set flag to preserve loop on next seek
        set({ _preserveLoopOnNextSeek: true });
        seek(startMarker.time);
      }
    }
  },

  setActiveLoop: (id: string | null) => {
    const { loopState, currentPieceId, tracks, playbackState, masterVolume } = get();

    const newLoops = loopState.loops.map(l => ({
      ...l,
      enabled: l.id === id,
    }));

    logger.debug(`🔁 Active loop set to: ${id || 'NONE'}`);

    const newLoopState = {
      ...loopState,
      loops: newLoops,
      activeLoopId: id,
    };

    set({
      loopState: newLoopState,
      _preserveLoopOnNextSeek: id !== null,
    });

    // Save to piece
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        newLoopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save active loop:', err));
    }
  },

  /** Enable a loop and play it from its start */
  playLoop: (id: string) => {
    const { loopState } = get();
    const loop = loopState.loops.find(l => l.id === id);
    if (!loop) return;
    const times = [loop.startMarkerId, loop.endMarkerId]
      .map(markerId => loopState.markers.find(m => m.id === markerId)?.time)
      .filter((time): time is number => time !== undefined);
    if (times.length !== 2) return;

    get().setActiveLoop(id);
    get().seek(Math.min(...times));
    if (!get().playbackState.isPlaying) get().play();
  },

  /** Loop chip: play the loop, or pause if it is the one playing */
  toggleLoopPlayback: (id: string) => {
    const { loopState, playbackState } = get();
    const isThisLoopPlaying = playbackState.isPlaying && loopState.activeLoopId === id
      && loopState.loops.some(l => l.id === id && l.enabled);
    if (isThisLoopPlaying) {
      get().pause();
    } else {
      get().playLoop(id);
    }
  },
});
