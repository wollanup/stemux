import { create } from 'zustand';
import type { AudioStore, AudioTrack } from '../types/audio';
import { saveAudioFile, deleteAudioFile, getAllAudioFiles } from '../utils/indexedDB';

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
  return stored ? JSON.parse(stored) : { enabled: false, start: 0, end: 0 };
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

  initAudioContext: () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    set({ audioContext: ctx });
  },

  addTrack: async (file: File) => {
    const { tracks, audioContext } = get();

    if (tracks.length >= 8) {
      alert('Maximum 8 tracks allowed');
      return;
    }

    const id = `track-${Date.now()}-${Math.random()}`;
    const color = COLORS[tracks.length % COLORS.length];

    const newTrack: AudioTrack = {
      id,
      name: file.name,
      file,
      buffer: null,
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

    // Decode audio in background
    if (audioContext) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await audioContext.decodeAudioData(arrayBuffer);

      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === id ? { ...t, buffer } : t
        ),
        playbackState: {
          ...state.playbackState,
          duration: Math.max(state.playbackState.duration, buffer.duration),
        },
      }));
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

    // Recalculate duration from remaining tracks
    const newDuration = newTracks.reduce((max, track) => {
      return track.buffer ? Math.max(max, track.buffer.duration) : max;
    }, 0);

    set({
      tracks: newTracks,
      playbackState: {
        ...get().playbackState,
        duration: newDuration,
      },
    });
    saveTrackSettings(newTracks);
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
    if (track) {
      get().updateTrack(id, { isMuted: !track.isMuted });
    }
  },

  toggleSolo: (id: string) => {
    const track = get().tracks.find((t) => t.id === id);
    if (track) {
      get().updateTrack(id, { isSolo: !track.isSolo });
    }
  },

  exclusiveSolo: (id: string) => {
    const newTracks = get().tracks.map((t) => ({
      ...t,
      isSolo: t.id === id,
    }));
    set({ tracks: newTracks });
    saveTrackSettings(newTracks);
  },

  unmuteAll: () => {
    const newTracks = get().tracks.map((t) => ({
      ...t,
      isMuted: false,
    }));
    set({ tracks: newTracks });
    saveTrackSettings(newTracks);
  },

  play: () => {
    set((state) => ({
      playbackState: { ...state.playbackState, isPlaying: true },
    }));
  },

  pause: () => {
    set((state) => ({
      playbackState: { ...state.playbackState, isPlaying: false },
    }));
  },

  seek: (time: number) => {
    set((state) => ({
      playbackState: { ...state.playbackState, currentTime: time },
    }));
    // Position playback no longer saved - always start fresh
  },

  setPlaybackRate: (rate: number) => {
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
    const newLoopRegion = { ...get().loopRegion, start, end };
    set({ loopRegion: newLoopRegion });
    saveLoopRegion(newLoopRegion);
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
            buffer: null,
          };
        }
        return null;
      })
      .filter((t: AudioTrack | null): t is AudioTrack => t !== null);

    // Show tracks immediately (even with null buffers)
    if (restoredTracks.length > 0) {
      useAudioStore.setState({
        tracks: restoredTracks,
      });
    }

    // Decode audio buffers in parallel (in background) - don't await
    if (restoredTracks.length > 0 && state.audioContext) {
      // Fire and forget - decode in background
      Promise.all(
        restoredTracks.map(async (track) => {
          try {
            const arrayBuffer = await track.file.arrayBuffer();
            const buffer = await state.audioContext!.decodeAudioData(arrayBuffer);

            // Update individual track with buffer
            useAudioStore.setState((currentState) => ({
              tracks: currentState.tracks.map((t) =>
                t.id === track.id ? { ...t, buffer } : t
              ),
            }));

            return buffer;
          } catch (error) {
            console.error(`Failed to decode track ${track.name}:`, error);
            return null;
          }
        })
      ).then((buffers) => {
        const validBuffers = buffers.filter((b): b is AudioBuffer => b !== null);

        if (validBuffers.length > 0) {
          useAudioStore.setState((currentState) => ({
            playbackState: {
              ...currentState.playbackState,
              duration: Math.max(...validBuffers.map(b => b.duration)),
            },
          }));
        }
      });
    }
  } catch (error) {
    console.error('Failed to restore tracks:', error);
  }
};
