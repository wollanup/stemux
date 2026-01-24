export interface AudioTrack {
  id: string;
  name: string;
  file: File;
  volume: number; // 0-1
  isMuted: boolean;
  isSolo: boolean;
  color: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number; // 0.5 - 2.0
}

export interface LoopRegion {
  enabled: boolean;
  start: number;
  end: number;
  isSettingLoop: boolean;
  loopStartMarker: number;
}

export interface AudioStore {
  tracks: AudioTrack[];
  playbackState: PlaybackState;
  loopRegion: LoopRegion;
  activeLoopTrackId: string | null;
  audioContext: AudioContext | null;
  masterVolume: number; // 0-1
  showLoopPanel: boolean;
  zoomLevel: number;
  waveformStyle: 'modern' | 'classic';
  waveformNormalize: boolean;
  
  addTrack: (file: File) => void;
  removeTrack: (id: string) => void;
  removeAllTracks: () => void;
  updateTrack: (id: string, updates: Partial<AudioTrack>) => void;
  setVolume: (id: string, volume: number) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  exclusiveSolo: (id: string) => void;
  unmuteAll: () => void;
  
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setMasterVolume: (volume: number) => void;
  
  setLoopRegion: (start: number, end: number) => void;
  startSettingLoop: (startTime: number) => void;
  cancelSettingLoop: () => void;
  toggleLoop: () => void;
  setActiveLoopTrack: (trackId: string | null) => void;
  toggleLoopPanel: () => void;

  zoomIn: () => void;
  zoomOut: () => void;
  setWaveformStyle: (style: 'modern' | 'classic') => void;
  setWaveformNormalize: (normalize: boolean) => void;
  
  initAudioContext: () => void;
}
