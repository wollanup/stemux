import { create } from 'zustand';
import type { AudioStore, AudioTrack } from '../types/audio';
import { saveAudioFile, deleteAudioFile, getAllAudioFiles } from '../utils/indexedDB';
import type WaveSurfer from 'wavesurfer.js';

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
const saveLoopRegion = (loopRegion: any) => {
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

export const useAudioStore = create<AudioStore>((set, get) => ({
  tracks: [],
  playbackState: {
    isPlaying: false,
    currentTime: loadCurrentPosition(),
    duration: 0,
    playbackRate: loadPlaybackRate(),
  },
  loopRegion: loadLoopRegion(),
  activeLoopTrackId: loadActiveLoopTrackId(),
  masterVolume: loadMasterVolume(),
  audioContext: null,
  showLoopPanel: false,
  zoomLevel: 0, // Direct px/sec value - 0 means fit to width without scrolling
  waveformStyle: loadWaveformStyle() as 'modern' | 'classic',
  waveformNormalize: loadWaveformNormalize(),

  initAudioContext: () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    console.log('🎵 PLAY called - instances:', wavesurferInstances.size);

    // Clear finished set at the start of each play
    finishedInstances.clear();

    // If loop enabled, seek to loop start before playing
    const { loopRegion } = get();
    if (loopRegion.enabled && loopRegion.start < loopRegion.end && loopRegion.end > 0) {
      console.log('🔁 Loop enabled, seeking to start:', loopRegion.start);
      wavesurferInstances.forEach((ws) => {
        ws.seekTo(loopRegion.start / ws.getDuration());
      });
    }

    // Call play on all WaveSurfer instances SIMULTANEOUSLY
    const instances = Array.from(wavesurferInstances.entries());
    Promise.all(
      instances.map(([id, ws]) => {
        console.log('Playing instance:', id);
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
    // Update state first
    set((state) => ({
      playbackState: { ...state.playbackState, currentTime: time },
    }));

    // Seek all WaveSurfer instances synchronously (no await)
    // Use Array.from to avoid iterator issues
    const instances = Array.from(wavesurferInstances.values());

    // Seek all at once (WaveSurfer's setTime is sync for the call, async for rendering)
    instances.forEach((ws) => {
      ws.setTime(time);
    });
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
      .map((setting: any) => {
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
    console.log('🏁 All tracks finished playing');
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
