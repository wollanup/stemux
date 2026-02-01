import { create } from 'zustand';
import type { AudioStore, AudioTrack, Piece, PieceSettings, PieceWithStats } from '../types/audio';
import { 
  saveAudioFile, 
  deleteAudioFile, 
  getAllAudioFiles,
  savePiece,
  getPiece,
  getAllPieces,
  deletePiece as deletePieceDB,
  savePieceSettings,
  getPieceSettings,
  deletePieceSettings,
  clearAllPieces,
  clearAllPieceSettings,
  clearAllAudioFiles,
  getAudioFileSize,
} from '../utils/indexedDB';
import type WaveSurfer from 'wavesurfer.js';
import {logger} from '../utils/logger';

const COLORS = [
  '#4ECDC4','#FFA07A','#BB8FCE', '#F7DC6F',
  '#85C1E2','#FF6B6B','#98D8C8','#e680a5',

];

// Save track settings to piece settings (no longer localStorage)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saveTrackSettingsToPiece = async (pieceId: string, tracks: AudioTrack[], loopState: any, playbackRate: number, masterVolume: number) => {
  const settings: PieceSettings = {
    trackSettings: tracks.map(t => ({
      id: t.id,
      name: t.name,
      volume: t.volume,
      isMuted: t.isMuted,
    isSolo: t.isSolo,
      color: t.color,
      isCollapsed: t.isCollapsed,
      isRecordable: t.isRecordable, // Save recordable flag
    })),
    loopState: {
      markers: loopState.markers,
      loops: loopState.loops,
      activeLoopId: loopState.activeLoopId,
    },
    playbackRate,
    masterVolume,
  };
  await savePieceSettings(pieceId, settings);
};

// Legacy: Load track settings from localStorage (for migration)
export const loadTrackSettings = () => {
  const stored = localStorage.getItem('practice-tracks-settings');
  return stored ? JSON.parse(stored) : [];
};

// Legacy loaders for migration
const loadPlaybackRate = () => {
  const stored = localStorage.getItem('practice-tracks-playback-rate');
  return stored ? parseFloat(stored) : 1.0;
};

const loadMasterVolume = () => {
  const stored = localStorage.getItem('practice-tracks-master-volume');
  return stored ? parseFloat(stored) : 1.0;
};

const loadLoopV2State = () => {
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

// WaveSurfer instances registry (outside Zustand to avoid re-renders)
export const wavesurferInstances = new Map<string, WaveSurfer>();

// Track which instances have finished playing
const finishedInstances = new Set<string>();

// Waveform style preference
const loadWaveformStyle = () => {
  const stored = localStorage.getItem('waveform-style');
  return stored || 'modern';
};

const saveWaveformStyle = (style: string) => {
  localStorage.setItem('waveform-style', style);
};

// Waveform normalize preference
const loadWaveformNormalize = () => {
  const stored = localStorage.getItem('waveform-normalize');
  return stored ? stored === 'true' : false;
};

const saveWaveformNormalize = (normalize: boolean) => {
  localStorage.setItem('waveform-normalize', normalize.toString());
};

// Waveform timeline preference
const loadWaveformTimeline = () => {
  const stored = localStorage.getItem('waveform-timeline');
  return stored ? stored === 'true' : false;
};

const saveWaveformTimeline = (timeline: boolean) => {
  localStorage.setItem('waveform-timeline', timeline.toString());
};

// Waveform minimap preference
const loadWaveformMinimap = () => {
  const stored = localStorage.getItem('waveform-minimap');
  return stored ? stored === 'true' : false;
};

const saveWaveformMinimap = (minimap: boolean) => {
  localStorage.setItem('waveform-minimap', minimap.toString());
};

// Current piece ID
const loadCurrentPieceId = () => {
  return localStorage.getItem('current-piece-id');
};

const saveCurrentPieceId = (id: string | null) => {
  if (id) {
    localStorage.setItem('current-piece-id', id);
  } else {
    localStorage.removeItem('current-piece-id');
  }
};

// Generate piece name from date
const generatePieceName = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}`;
};

// Global flag to prevent feedback loops during sync
let isSynchronizing = false;

export const useAudioStore = create<AudioStore>((set, get) => ({
  tracks: [],
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: loadPlaybackRate(),
  },
  loopState: {
    ...loadLoopV2State(),
    editMode: false,
  },
  masterVolume: loadMasterVolume(),
  audioContext: null,
  showLoopPanel: false,
  zoomLevel: 0,
  waveformStyle: loadWaveformStyle() as 'modern' | 'classic',
  waveformNormalize: loadWaveformNormalize(),
  waveformTimeline: loadWaveformTimeline(),
  waveformMinimap: loadWaveformMinimap(),
  currentPieceId: loadCurrentPieceId(),
  currentPieceName: '',
  
  // Recording state
  isRecordingSupported: typeof navigator !== 'undefined' && 
    !!navigator.mediaDevices && 
    typeof navigator.mediaDevices.getUserMedia === 'function',
  mediaStream: null,
  recordingStartTime: null,
  loopBackup: null,
  pendingSeekAfterReady: null,

  initAudioContext: () => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    set({ audioContext: ctx });
  },

  addTrack: async (file: File) => {
    const { tracks, pause, seek, currentPieceId, createPiece } = get();

    if (tracks.length >= 8) {
      alert('Maximum 8 tracks allowed');
      return;
    }

    // Create piece if none exists
    let pieceId = currentPieceId;
    if (!pieceId) {
      pieceId = await createPiece(generatePieceName());
    }

    // Pause and reset position when adding a track
    pause();
    seek(0);

    const id = `track-${Date.now()}-${Math.random()}`;
    const color = COLORS[tracks.length % COLORS.length];

    const newTrack: AudioTrack = {
      id,
      name: file.name,
      file,
      volume: 0.8,
      isMuted: false,
      isSolo: false,
      color,
      isLoading: true,
    };

    const newTracks = [...tracks, newTrack];
    set({ tracks: newTracks });

    // Save file to IndexedDB
    try {
      await saveAudioFile(id, file);
      
      // Update piece with new track ID
      const piece = await getPiece(pieceId!);
      if (piece) {
        piece.trackIds = [...piece.trackIds, id];
        piece.updatedAt = Date.now();
        await savePiece(piece);
      }
      
      // Save settings to piece
      const state = get();
      await saveTrackSettingsToPiece(
        pieceId!,
        state.tracks.map(t => t.id === id ? { ...t, isLoading: false } : t),
        state.loopState,
        state.playbackState.playbackRate,
        state.masterVolume
      );
      
      // Mark as loaded
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === id ? { ...t, isLoading: false } : t
        ),
      }));
    } catch (error) {
      console.error('Failed to save audio file:', error);
      
      // Mark as loaded even on error
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === id ? { ...t, isLoading: false } : t
        ),
      }));
    }
  },

  removeTrack: async (id: string) => {
    const { currentPieceId } = get();
    
    // Delete from IndexedDB
    try {
      await deleteAudioFile(id);
    } catch (error) {
      console.error('Failed to delete audio file:', error);
    }

    const newTracks = get().tracks.filter((t) => t.id !== id);

    set({
      tracks: newTracks,
    });
    
    // Update piece
    if (currentPieceId) {
      const piece = await getPiece(currentPieceId);
      if (piece) {
        piece.trackIds = piece.trackIds.filter(tid => tid !== id);
        piece.updatedAt = Date.now();
        await savePiece(piece);
      }
      
      const state = get();
      await saveTrackSettingsToPiece(
        currentPieceId,
        newTracks,
        state.loopState,
        state.playbackState.playbackRate,
        state.masterVolume
      );
    }
  },

  removeAllTracks: async () => {
    const { tracks, pause, seek, currentPieceId } = get();
    
    // Pause and reset position
    pause();
    seek(0);

    // Delete all files from IndexedDB
    try {
      await Promise.all(tracks.map((track) => deleteAudioFile(track.id)));
    } catch (error) {
      console.error('Failed to delete audio files:', error);
    }

    // Clear tracks AND loop state
    set({ 
      tracks: [],
      loopState: {
        editMode: false,
        markers: [],
        loops: [],
        activeLoopId: null,
      }
    });
    
    // Update piece
    if (currentPieceId) {
      const piece = await getPiece(currentPieceId);
      if (piece) {
        piece.trackIds = [];
        piece.updatedAt = Date.now();
        await savePiece(piece);
      }
      
      await saveTrackSettingsToPiece(
        currentPieceId,
        [],
        { markers: [], loops: [], activeLoopId: null },
        1.0,
        1.0
      );
    }
  },

  updateTrack: (id: string, updates: Partial<AudioTrack>) => {
    const newTracks = get().tracks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    set({ tracks: newTracks });
    
    // Save to piece (async but don't wait)
    const { currentPieceId, loopState, playbackState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        newTracks,
        loopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save track settings:', err));
    }
  },

  reorderTracks: (fromIndex: number, toIndex: number) => {
    const tracks = [...get().tracks];
    const [movedTrack] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, movedTrack);
    set({ tracks });
    
    // Save to piece
    const { currentPieceId, loopState, playbackState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
        loopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save track settings:', err));
    }
  },

  setVolume: (id: string, volume: number) => {
    get().updateTrack(id, { volume });
  },

  toggleMute: (id: string) => {
    const track = get().tracks.find((t) => t.id === id);
    if (!track) return;

    const newMutedState = !track.isMuted;
    get().updateTrack(id, { isMuted: newMutedState });

    // Update WaveSurfer instance directly
    const ws = wavesurferInstances.get(id);
    if (ws) {
      const allTracks = get().tracks;
      const hasSoloedTracks = allTracks.some(t => t.isSolo);
      const shouldBeMuted = newMutedState || (hasSoloedTracks && !track.isSolo);
      ws.setMuted(shouldBeMuted);
    }
  },

  toggleSolo: (id: string) => {
    const tracks = get().tracks;
    const track = tracks.find((t) => t.id === id);
    if (!track) return;

    const newSoloState = !track.isSolo;

    // Update track state
    get().updateTrack(id, { isSolo: newSoloState });

    // Calculate with the NEW state
    const allTracks = tracks.map(t =>
      t.id === id ? { ...t, isSolo: newSoloState } : t
    );
    const hasSoloedTracks = allTracks.some(t => t.isSolo);

    // Apply mute to ALL instances
    allTracks.forEach(t => {
      const ws = wavesurferInstances.get(t.id);
      if (ws) {
        const shouldBeMuted = t.isMuted || (hasSoloedTracks && !t.isSolo);
        ws.setMuted(shouldBeMuted);
      }
    });
  },

  exclusiveSolo: (id: string) => {
    const newTracks = get().tracks.map((t) => ({
      ...t,
      isSolo: t.id === id,
    }));
    set({ tracks: newTracks });

    // Save to piece
    const { currentPieceId, loopState, playbackState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        newTracks,
        loopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save track settings:', err));
    }

    // Update all WaveSurfer instances - all except 'id' are muted
    newTracks.forEach(t => {
      const ws = wavesurferInstances.get(t.id);
      if (ws) {
        const shouldBeMuted = t.isMuted || t.id !== id;
        ws.setMuted(shouldBeMuted);
      }
    });
  },

  unmuteAll: () => {
    const newTracks = get().tracks.map((t) => ({
      ...t,
      isMuted: false,
    }));
    set({ tracks: newTracks });

    // Save to piece
    const { currentPieceId, loopState, playbackState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        newTracks,
        loopState,
        playbackState.playbackRate,
        masterVolume
      ).catch(err => console.error('Failed to save track settings:', err));
    }

    // Update all WaveSurfer instances
    const hasSoloedTracks = newTracks.some(t => t.isSolo);
    newTracks.forEach(t => {
      const ws = wavesurferInstances.get(t.id);
      if (ws) {
        const shouldBeMuted = hasSoloedTracks && !t.isSolo;
        ws.setMuted(shouldBeMuted);
      }
    });
  },

  play: () => {
    const { tracks } = get();
    logger.debug('🎵 PLAY called - instances:', wavesurferInstances.size);

    // Check if any track is armed for recording
    const armedTrack = tracks.find((t) => t.isArmed && t.isRecordable);
    if (armedTrack) {
      get().startRecording(armedTrack.id);
    }

    // Clear finished set at the start of each play
    finishedInstances.clear();

    // Call play on all WaveSurfer instances SIMULTANEOUSLY
    const instances = Array.from(wavesurferInstances.entries());
    Promise.all(
      instances.map(([id, ws]) => {
        // Skip if track has already finished (currentTime >= duration)
        const currentTime = ws.getCurrentTime();
        const duration = ws.getDuration();
        
        if (currentTime >= duration) {
          logger.debug('Skipping finished instance:', id, `(${currentTime.toFixed(2)}s >= ${duration.toFixed(2)}s)`);
          finishedInstances.add(id); // Mark as finished
          return Promise.resolve();
        }
        
        logger.debug('Playing instance:', id);
        return ws.play().catch(err => console.warn('WaveSurfer play error:', err));
      })
    );

    set((state) => ({
      playbackState: { ...state.playbackState, isPlaying: true },
    }));
  },

  pause: () => {
    const { tracks } = get();
    
    // Stop recording if any track is recording
    const recordingTrack = tracks.find((t) => t.recordingState === 'recording');
    if (recordingTrack) {
      get().stopRecording(recordingTrack.id);
    }
    
    // Disarm any armed track
    const armedTrack = tracks.find((t) => t.isArmed);
    if (armedTrack) {
      get().toggleRecordArm(armedTrack.id); // Will disarm it
    }

    // Pause all WaveSurfer instances simultaneously
    const instances = Array.from(wavesurferInstances.values());
    instances.forEach((ws) => {
      ws.pause();
    });

    set((state) => ({
      playbackState: { ...state.playbackState, isPlaying: false },
    }));
  },

  seek: (time: number) => {
    const state = get();
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
    
    // Update state first
    set((state) => {
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

    // Set global flag to prevent feedback loops
    isSynchronizing = true;

    // Seek all WaveSurfer instances synchronously (no await)
    // Use Array.from to avoid iterator issues
    const instances = Array.from(wavesurferInstances.entries());
    const isCurrentlyPlaying = state.playbackState.isPlaying;

    // Seek all at once (WaveSurfer's setTime is sync for the call, async for rendering)
    instances.forEach(([id, ws]) => {
      ws.setTime(time);
      
      // If seeking back, check if this track can now play (was finished but new time < duration)
      const duration = ws.getDuration();
      if (finishedInstances.has(id) && time < duration) {
        logger.debug('🔄 Re-enabling finished track:', id, `(${time.toFixed(2)}s < ${duration.toFixed(2)}s)`);
        finishedInstances.delete(id);
        
        // If currently playing, restart playback on this track
        if (isCurrentlyPlaying) {
          logger.debug('▶️ Auto-playing re-enabled track:', id);
          ws.play().catch(err => console.warn('Failed to play re-enabled track:', err));
        }
      }
    });

    // Reset flag after a short delay
    setTimeout(() => {
      isSynchronizing = false;
    }, 50);
  },

  setPlaybackRate: (rate: number) => {
    // Set playback rate on all WaveSurfer instances
    wavesurferInstances.forEach((ws) => {
      ws.setPlaybackRate(rate, true); // true = preserve pitch
    });

    set((state) => ({
      playbackState: { ...state.playbackState, playbackRate: rate },
    }));
    
    // Save to piece
    const { currentPieceId, tracks, loopState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(
        currentPieceId,
        tracks,
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

  toggleLoopPanel: () => {
    set((state) => ({ showLoopPanel: !state.showLoopPanel }));
  },

  // Loop v2 actions
  toggleLoopEditMode: () => {
    set((state) => {
      const newEditMode = !state.loopState.editMode;
      logger.debug('🎯 Loop edit mode:', newEditMode ? 'ON' : 'OFF');
      return {
        loopState: {
          ...state.loopState,
          editMode: newEditMode,
        },
      };
    });
  },

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

  setWaveformStyle: (style: 'modern' | 'classic') => {
    set({ waveformStyle: style });
    saveWaveformStyle(style);
  },

  setWaveformNormalize: (normalize: boolean) => {
    set({ waveformNormalize: normalize });
    saveWaveformNormalize(normalize);
  },

  zoomIn: () => {
    set((state) => ({
      zoomLevel: state.zoomLevel < 10
        ? state.zoomLevel + 1
        : state.zoomLevel + 10
    }));
  },

  zoomOut: () => {
    set((state) => ({
      zoomLevel: state.zoomLevel > 10
        ? state.zoomLevel - 10
        : Math.max(state.zoomLevel - 1, 1)
    }));
  },

  setWaveformTimeline: (timeline: boolean) => {
    set({ waveformTimeline: timeline });
    saveWaveformTimeline(timeline);
  },

  setWaveformMinimap: (minimap: boolean) => {
    set({ waveformMinimap: minimap });
    saveWaveformMinimap(minimap);
  },

  // Piece management actions
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

    set({ currentPieceId: id });
    saveCurrentPieceId(id);
    
    logger.debug(`🎼 Created piece: ${name} (${id})`);
    return id;
  },

  loadPiece: async (id: string): Promise<void> => {
    const { pause } = get();
    
    // Pause playback
    pause();

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
        editMode: false,
      },
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
          editMode: false,
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
        editMode: false,
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

  // Clean orphaned data (files without pieces, trackIds without files)
  cleanOrphanedData: async (): Promise<{ filesDeleted: number; referencesRemoved: number }> => {
    logger.log('🧹 Starting orphaned data cleanup...');
    
    const pieces = await getAllPieces();
    const allFiles = await getAllAudioFiles();
    
    logger.log(`📊 Found ${pieces.length} pieces and ${allFiles.length} files in IndexedDB`);
    
    let filesDeleted = 0;
    let referencesRemoved = 0;
    
    for (const piece of pieces) {
      // Get piece settings - this is the SOURCE OF TRUTH
      const settings = await getPieceSettings(piece.id);
      if (!settings) {
        console.warn(`⚠️ No settings found for piece ${piece.name}, skipping cleanup`);
        continue;
      }
      
      // Valid track IDs = those in pieceSettings.trackSettings
      const validTrackIds = new Set(settings.trackSettings.map(t => t.id));
      logger.log(`📦 Piece "${piece.name}" has ${settings.trackSettings.length} valid tracks in settings`);
      logger.log(`   piece.trackIds has ${piece.trackIds.length} entries`);
      
      let pieceModified = false;
      
      // Clean piece.trackIds - keep only those in trackSettings
      const cleanedTrackIds = piece.trackIds.filter(trackId => {
        const isValid = validTrackIds.has(trackId);
        if (!isValid) {
          logger.log(`🗑️ Removing invalid trackId from piece.trackIds: ${trackId}`);
          referencesRemoved++;
          pieceModified = true;
        }
        return isValid;
      });
      
      // Update piece.trackIds if changed
      if (pieceModified) {
        piece.trackIds = cleanedTrackIds;
        piece.updatedAt = Date.now();
        await savePiece(piece);
        logger.log(`✅ Updated piece.trackIds for "${piece.name}": ${cleanedTrackIds.length} valid tracks`);
      }
      
      // Delete files NOT in trackSettings for this piece
      for (const file of allFiles) {
        // Check if this file is referenced by this piece's trackSettings
        if (piece.trackIds.includes(file.id) && !validTrackIds.has(file.id)) {
          logger.log(`🗑️ Deleting orphaned file: ${file.id} (${file.file?.name || 'unknown'})`);
          await deleteAudioFile(file.id);
          filesDeleted++;
        }
      }
    }
    
    logger.log(`🧹 Cleanup complete: ${filesDeleted} orphaned files deleted, ${referencesRemoved} invalid references removed`);
    
    return { filesDeleted, referencesRemoved };
  },

  // Recording actions
  addRecordableTrack: async () => {
    const { tracks, pause, currentPieceId, createPiece } = get();

    if (tracks.length >= 8) {
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
    const color = COLORS[tracks.length % COLORS.length];

    const newTrack: AudioTrack = {
      id,
      name,
      volume: 0.8, // Default volume for recordings
      isMuted: false,
      isSolo: false,
      color,
      isRecordable: true,
      isArmed: false,
      recordingState: 'idle',
    };

    const newTracks = [...tracks, newTrack];
    set({ tracks: newTracks });

    // Save settings to piece
    const state = get();
    await saveTrackSettingsToPiece(
      pieceId!,
      state.tracks,
      state.loopState,
      state.playbackState.playbackRate,
      state.masterVolume
    );

    // Update piece
    const piece = await getPiece(pieceId!);
    if (piece) {
      piece.updatedAt = Date.now();
      await savePiece(piece);
    }

    logger.debug('🎙️ Added recordable track:', name);
  },

  toggleRecordArm: (trackId: string) => {
    const { tracks, loopState } = get();

    const track = tracks.find((t) => t.id === trackId);
    if (!track || !track.isRecordable) return;

    const newArmedState = !track.isArmed;

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
          loopState: { ...loopState, activeLoopId: loopBackup.activeLoopId },
          loopBackup: null,
        });
      }
    }

    // Update tracks (exclusive arm)
    const updatedTracks = tracks.map((t) => ({
      ...t,
      isArmed: t.id === trackId ? newArmedState : false,
      recordingState: t.id === trackId && newArmedState ? ('armed' as const) : ('idle' as const),
    }));

    set({ tracks: updatedTracks });
    logger.debug(`🎙️ ${newArmedState ? 'Armed' : 'Disarmed'} track:`, track.name);
  },

  startRecording: async (trackId: string) => {
    const { tracks, playbackState, audioContext } = get();

    const track = tracks.find((t) => t.id === trackId);
    if (!track || !track.isArmed) return;

    // Get PRECISE time from WaveSurfer instance (sample-accurate)
    let recordingStartOffset = 0;
    
    // Try to get precise time from first WaveSurfer instance
    const firstWavesurfer = Array.from(wavesurferInstances.values())[0];
    if (firstWavesurfer) {
      recordingStartOffset = firstWavesurfer.getCurrentTime();
      logger.log(`⏱️ Recording armed at PRECISE time from WaveSurfer: ${recordingStartOffset.toFixed(6)}s`);
    } else {
      // Fallback to playbackState (less precise)
      recordingStartOffset = playbackState.currentTime;
      logger.log(`⏱️ Recording armed at playbackState time: ${recordingStartOffset.toFixed(6)}s (less precise)`);
    }
    
    if (audioContext) {
      logger.log(`⏱️ AudioContext.currentTime: ${audioContext.currentTime.toFixed(6)}s`);
    }
    
    set({
      recordingStartTime: recordingStartOffset,
      tracks: tracks.map((t) =>
        t.id === trackId 
          ? { ...t, recordingState: 'recording' as const, recordingStartOffset } 
          : t
      ),
    });

    logger.debug('🎙️ Recording started at offset:', recordingStartOffset);
  },

  stopRecording: async (trackId: string) => {
    const { tracks } = get();

    set({
      tracks: tracks.map((t) =>
        t.id === trackId ? { ...t, recordingState: 'stopped' as const } : t
      ),
      recordingStartTime: null,
    });
    
    logger.debug('🎙️ Recording stopped');
  },

  // Called by WaveformDisplay when recording is complete with blob
  saveRecording: async (trackId: string, blob: Blob) => {
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
            ? { ...t, recordedBlob: blob, file, recordingState: 'stopped' as const }
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

      // Update state - this will trigger RecordableWaveform → WaveformDisplay switch
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, recordedBlob: blob, file, recordingState: 'stopped' as const }
            : t
        ),
        // Set pending seek - WaveformDisplay will pick this up on 'ready' event
        pendingSeekAfterReady: recordingStartOffset,
      }));

      logger.log(`⏱️ Pending seek after waveform ready: ${recordingStartOffset.toFixed(4)}s`);

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
            ? { ...t, recordedBlob: undefined, file: undefined, recordingState: 'idle' as const }
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
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? { ...t, recordedBlob: undefined, file: undefined, recordingState: 'idle' as const }
            : t
        ),
      }));
    } catch (error) {
      console.error('Failed to clear recording:', error);
    }
  },
}));

// Function to restore tracks from IndexedDB on app init
export const restoreTracks = async () => {
  try {
    const state = useAudioStore.getState();

    if (!state.audioContext) {
      state.initAudioContext();
    }

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

// Helper functions to manage WaveSurfer instances
export const registerWavesurfer = (trackId: string, instance: WaveSurfer) => {
  wavesurferInstances.set(trackId, instance);
  finishedInstances.delete(trackId); // Reset finish state when registering
};

export const unregisterWavesurfer = (trackId: string) => {
  wavesurferInstances.delete(trackId);
  finishedInstances.delete(trackId);
};

export const markTrackFinished = (trackId: string) => {
  finishedInstances.add(trackId);

  // Check if ALL tracks have finished
  const allFinished = wavesurferInstances.size > 0 &&
                      finishedInstances.size === wavesurferInstances.size;

  if (allFinished) {
    logger.debug('🏁 All tracks finished playing');
    const { pause, seek } = useAudioStore.getState();
    pause();
    seek(0); // Reset to start
    // Clear finished set for next playback
    finishedInstances.clear();
  }
};

export const getWavesurfer = (trackId: string) => {
  return wavesurferInstances.get(trackId);
};

export const getAllWavesurfers = () => {
  return Array.from(wavesurferInstances.values());
};

// Export function to check if currently synchronizing
export const getIsSynchronizing = () => isSynchronizing;
