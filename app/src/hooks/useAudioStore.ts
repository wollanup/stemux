import { create } from 'zustand';
import type { AudioStore, AudioTrack, LoopRegion, Marker, Loop } from '../types/audio';
import { saveAudioFile, deleteAudioFile, getAllAudioFiles } from '../utils/indexedDB';
import type WaveSurfer from 'wavesurfer.js';
import {logger} from '../utils/logger';

const COLORS = [
  '#4ECDC4','#FFA07A','#BB8FCE', '#F7DC6F',
  '#85C1E2','#FF6B6B','#98D8C8','#e680a5',

];

// Save track settings to localStorage (no perf impact - called only on user actions)
const saveTrackSettings = (tracks: AudioTrack[]) => {
  const settings = tracks.map(t => ({
    id: t.id,
    name: t.name,
    volume: t.volume,
    isMuted: t.isMuted,
    isSolo: t.isSolo,
    color: t.color,
  }));
  localStorage.setItem('practice-tracks-settings', JSON.stringify(settings));
};

// Load track settings from localStorage
export const loadTrackSettings = () => {
  const stored = localStorage.getItem('practice-tracks-settings');
  return stored ? JSON.parse(stored) : [];
};

// Save loop region to localStorage
const saveLoopRegion = (loopRegion: LoopRegion) => {
  localStorage.setItem('practice-tracks-loop', JSON.stringify(loopRegion));
};

// Load loop region from localStorage
const loadLoopRegion = () => {
  const stored = localStorage.getItem('practice-tracks-loop');
  return stored ? { ...JSON.parse(stored), isSettingLoop: false, loopStartMarker: 0 } : { enabled: false, start: 0, end: 0, isSettingLoop: false, loopStartMarker: 0 };
};

// Save active loop track ID to localStorage
const saveActiveLoopTrackId = (trackId: string | null) => {
  if (trackId) {
    localStorage.setItem('practice-tracks-active-loop', trackId);
  } else {
    localStorage.removeItem('practice-tracks-active-loop');
  }
};

// Load active loop track ID from localStorage
const loadActiveLoopTrackId = () => {
  return localStorage.getItem('practice-tracks-active-loop');
};

// Save playback rate to localStorage
const savePlaybackRate = (rate: number) => {
  localStorage.setItem('practice-tracks-playback-rate', rate.toString());
};

// Load playback rate from localStorage
const loadPlaybackRate = () => {
  const stored = localStorage.getItem('practice-tracks-playback-rate');
  return stored ? parseFloat(stored) : 1.0;
};

// Load current playback position from localStorage
const loadCurrentPosition = () => {
  // Always start at 0 (beginning or loop start if loop enabled)
  return 0;
};

// Save master volume to localStorage
const saveMasterVolume = (volume: number) => {
  localStorage.setItem('practice-tracks-master-volume', volume.toString());
};

// Load master volume from localStorage
const loadMasterVolume = () => {
  const stored = localStorage.getItem('practice-tracks-master-volume');
  return stored ? parseFloat(stored) : 1.0;
};

// WaveSurfer instances registry (outside Zustand to avoid re-renders)
const wavesurferInstances = new Map<string, WaveSurfer>();

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

// Save loop v2 state (markers + loops) to localStorage
const saveLoopV2State = (markers: Marker[], loops: Loop[], activeLoopId: string | null) => {
  const state = {
    markers,
    loops,
    activeLoopId,
  };
  localStorage.setItem('practice-tracks-loop-v2', JSON.stringify(state));
};

// Load loop v2 state from localStorage
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

export // Global flag to prevent feedback loops during sync
let isSynchronizing = false;

export const useAudioStore = create<AudioStore>((set, get) => ({
  tracks: [],
  playbackState: {
    isPlaying: false,
    currentTime: loadCurrentPosition(),
    duration: 0,
    playbackRate: loadPlaybackRate(),
  },
  loopRegion: loadLoopRegion(),
  loopState: {
    ...loadLoopV2State(),
    editMode: false, // Always start in standard mode
  },
  activeLoopTrackId: loadActiveLoopTrackId(),
  masterVolume: loadMasterVolume(),
  audioContext: null,
  showLoopPanel: false,
  zoomLevel: 0, // Direct px/sec value - 0 means fit to width without scrolling
  waveformStyle: loadWaveformStyle() as 'modern' | 'classic',
  waveformNormalize: loadWaveformNormalize(),
  waveformTimeline: loadWaveformTimeline(),
  waveformMinimap: loadWaveformMinimap(),

  initAudioContext: () => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    set({ audioContext: ctx });
  },

  addTrack: async (file: File) => {
    const { tracks, pause, seek } = get();

    if (tracks.length >= 8) {
      alert('Maximum 8 tracks allowed');
      return;
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
    };

    const newTracks = [...tracks, newTrack];
    set({ tracks: newTracks });
    saveTrackSettings(newTracks);

    // Save file to IndexedDB
    try {
      await saveAudioFile(id, file);
    } catch (error) {
      console.error('Failed to save audio file:', error);
    }
  },

  removeTrack: async (id: string) => {
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
    saveTrackSettings(newTracks);
  },

  removeAllTracks: async () => {
    const { tracks, pause, seek } = get();
    
    // Pause and reset position
    pause();
    seek(0);

    // Delete all files from IndexedDB
    try {
      await Promise.all(tracks.map((track) => deleteAudioFile(track.id)));
    } catch (error) {
      console.error('Failed to delete audio files:', error);
    }

    // Clear tracks
    set({ tracks: [] });
    saveTrackSettings([]);
  },

  updateTrack: (id: string, updates: Partial<AudioTrack>) => {
    const newTracks = get().tracks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    set({ tracks: newTracks });
    saveTrackSettings(newTracks);
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
    saveTrackSettings(newTracks);

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
    saveTrackSettings(newTracks);

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
    logger.debug('🎵 PLAY called - instances:', wavesurferInstances.size);

    // Clear finished set at the start of each play
    finishedInstances.clear();

    // If loop enabled, seek to loop start before playing
    const { loopRegion } = get();
    if (loopRegion.enabled && loopRegion.start < loopRegion.end && loopRegion.end > 0) {
      logger.debug('🔁 Loop enabled, seeking to start:', loopRegion.start);
      wavesurferInstances.forEach((ws) => {
        ws.seekTo(loopRegion.start / ws.getDuration());
      });
    }

    // Call play on all WaveSurfer instances SIMULTANEOUSLY
    const instances = Array.from(wavesurferInstances.entries());
    Promise.all(
      instances.map(([id, ws]) => {
        logger.debug('Playing instance:', id);
        return ws.play().catch(err => console.warn('WaveSurfer play error:', err));
      })
    );

    set((state) => ({
      playbackState: { ...state.playbackState, isPlaying: true },
    }));
  },

  pause: () => {
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
        _preserveLoopOnNextSeek: false, // Reset flag
      };
      
      // Disable active loop only if seeking outside of it
      if (!preserveLoop && !seekingInsideActiveLoop && state.loopState.activeLoopId) {
        logger.debug('🔓 Disabling loop (seeking outside loop)');
        updates.loopState = {
          ...state.loopState,
          activeLoopId: null,
          loops: state.loopState.loops.map(l => ({ ...l, enabled: false }))
        };
        saveLoopV2State(updates.loopState.markers, updates.loopState.loops, null);
      } else if (seekingInsideActiveLoop) {
        logger.debug('✅ Keeping loop active (seeking inside loop)');
      }
      
      return updates;
    });

    // Set global flag to prevent feedback loops
    isSynchronizing = true;

    // Seek all WaveSurfer instances synchronously (no await)
    // Use Array.from to avoid iterator issues
    const instances = Array.from(wavesurferInstances.values());

    // Seek all at once (WaveSurfer's setTime is sync for the call, async for rendering)
    instances.forEach((ws) => {
      ws.setTime(time);
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
    savePlaybackRate(rate);
  },

  setMasterVolume: (volume: number) => {
    set({ masterVolume: volume });
    saveMasterVolume(volume);
  },

  setLoopRegion: (start: number, end: number) => {
    const newLoopRegion = { ...get().loopRegion, start, end, isSettingLoop: false, loopStartMarker: 0 };
    set({ loopRegion: newLoopRegion });
    saveLoopRegion(newLoopRegion);
  },

  startSettingLoop: (startTime: number) => {
    const newLoopRegion = { ...get().loopRegion, isSettingLoop: true, loopStartMarker: startTime };
    set({ loopRegion: newLoopRegion });
  },

  cancelSettingLoop: () => {
    const newLoopRegion = { ...get().loopRegion, isSettingLoop: false, loopStartMarker: 0 };
    set({ loopRegion: newLoopRegion });
  },

  toggleLoop: () => {
    const newLoopRegion = { ...get().loopRegion, enabled: !get().loopRegion.enabled };
    set({ loopRegion: newLoopRegion });
    saveLoopRegion(newLoopRegion);
  },

  setActiveLoopTrack: (trackId: string | null) => {
    set({ activeLoopTrackId: trackId });
    saveActiveLoopTrackId(trackId);
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
    const { loopState, playbackState } = get();
    
    // Limit markers
    if (loopState.markers.length >= 20) {
      console.warn('⚠️ Maximum 20 markers reached');
      return '';
    }

    const id = `marker-${Date.now()}-${Math.random()}`;
    const newMarker: import('../types/audio').Marker = {
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

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);

    return id;
  },

  removeMarker: (id: string) => {
    const { loopState } = get();
    
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

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);
  },

  updateMarkerTime: (id: string, time: number) => {
    const { loopState, playbackState } = get();
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

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);
  },

  createLoop: (startMarkerId: string, endMarkerId: string) => {
    const { loopState } = get();

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
    const newLoop: import('../types/audio').Loop = {
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

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);

    return id;
  },

  removeLoop: (id: string) => {
    const { loopState } = get();
    const newLoops = loopState.loops.filter(l => l.id !== id);

    logger.debug(`🗑️ Removed loop ${id}`);

    const newLoopState = {
      ...loopState,
      loops: newLoops,
      activeLoopId: loopState.activeLoopId === id ? null : loopState.activeLoopId,
    };

    set({ loopState: newLoopState });

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);
  },

  toggleLoopById: (id: string) => {
    const { loopState, seek } = get();
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

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);

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
    const { loopState } = get();

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
      // Set a flag to preserve loop on next seek (for loop zone clicks)
      _preserveLoopOnNextSeek: id !== null,
    });

    // Save to localStorage
    saveLoopV2State(newLoopState.markers, newLoopState.loops, newLoopState.activeLoopId);
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
}));

// Function to restore tracks from IndexedDB on app init
export const restoreTracks = async () => {
  try {
    const trackSettings = loadTrackSettings();
    const storedFiles = await getAllAudioFiles();
    const state = useAudioStore.getState();

    if (!state.audioContext) {
      state.initAudioContext();
    }

    // Create all tracks immediately with null buffers
    const restoredTracks: AudioTrack[] = trackSettings
      .map((setting: Partial<AudioTrack> & { id: string }) => {
        const storedFile = storedFiles.find(f => f.id === setting.id);
        if (storedFile) {
          return {
            ...setting,
            file: storedFile.file,
          };
        }
        return null;
      })
      .filter((t: AudioTrack | null): t is AudioTrack => t !== null);

    // Show tracks immediately
    if (restoredTracks.length > 0) {
      useAudioStore.setState({
        tracks: restoredTracks,
      });
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
    const { loopRegion, pause, seek } = useAudioStore.getState();
    if (!loopRegion.enabled) {
      pause();
      seek(0); // Reset to start
    }
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
