export interface AudioTrack {
  id: string;
  name: string;
  file?: File; // Optional for recordable tracks
  volume: number; // 0-1
  isMuted: boolean;
  isSolo: boolean;
  color: string;
  isLoading?: boolean; // True during file import/loading
  isCollapsed?: boolean; // Track expanded/collapsed state
  height?: number; // Lane height (px) set by the user, default when undefined
  
  // Recording properties
  isRecordable?: boolean; // true if recording track
  isArmed?: boolean; // REC toggle state (ON/OFF)
  recordedBlob?: Blob; // Recorded audio data
  recordingState?: 'idle' | 'armed' | 'recording' | 'stopped';
  recordingStartOffset?: number; // Piece position (seconds) of the first recorded sample
  clipOffset?: number; // Position of the clip on the timeline (seconds), 0 = start of the piece
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number; // 0.5 - 2.0
}

// Loop v2 types
export interface Marker {
  id: string;
  time: number;
  createdAt: number;
  label?: string;
}

export interface Loop {
  id: string;
  startMarkerId: string;
  endMarkerId: string;
  enabled: boolean;
  createdAt: number;
  color?: string; // From LOOP_COLORS; missing on loops saved before colors existed
}

export interface LoopState {
  markers: Marker[];
  loops: Loop[];
  activeLoopId: string | null;
}

// Piece (morceau) types
export interface PieceSettings {
  trackSettings: Array<{
    id: string;
    name: string;
    volume: number;
    isMuted: boolean;
    isSolo: boolean;
    color: string;
    isCollapsed?: boolean;
    height?: number;
    isRecordable?: boolean; // Track is a recording track
    clipOffset?: number; // Position of the clip on the timeline (seconds)
  }>;
  loopState: {
    markers: Marker[];
    loops: Loop[];
    activeLoopId: string | null;
  };
  playbackRate: number;
  masterVolume: number;
}

export interface Piece {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackIds: string[];
}

export interface PieceWithStats extends Piece {
  duration: number;
  trackCount: number;
  size: number;
}

export interface AudioStore {
  tracks: AudioTrack[];
  playbackState: PlaybackState;
  loopState: LoopState; // Loop v2
  masterVolume: number; // 0-1
  zoomLevel: number;
  waveformStyle: 'modern' | 'classic';
  waveformNormalize: boolean;
  _preserveLoopOnNextSeek?: boolean; // Internal flag for loop activation
  currentPieceId: string | null;
  currentPieceName: string;
  
  // Recording state
  isRecordingSupported: boolean;
  loopBackup: { activeLoopId: string | null } | null;
  /** Loop to enable when the playhead enters it (not saved) */
  armedLoopId: string | null;
  
  addTrack: (file: File) => Promise<void>;
  removeTrack: (id: string) => void;
  removeAllTracks: () => void;
  updateTrack: (id: string, updates: Partial<AudioTrack>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  setVolume: (id: string, volume: number) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  exclusiveSolo: (id: string) => void;
  unmuteAll: () => void;
  
  // Recording actions
  addRecordableTrack: () => Promise<void>;
  toggleRecordArm: (trackId: string) => void;
  startRecording: (trackId: string, ctxTime: number) => Promise<void>;
  stopRecording: (trackId: string) => Promise<void>;
  saveRecording: (trackId: string, blob: Blob, clipOffset?: number) => Promise<void>;
  clearRecording: (trackId: string) => Promise<void>;
  
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setMasterVolume: (volume: number) => void;
  

  // Loop v2 actions
  addMarker: (time: number, label?: string) => string;
  removeMarker: (id: string) => void;
  updateMarkerTime: (id: string, time: number) => void;
  moveLoop: (id: string, delta: number) => void;
  createLoop: (startMarkerId: string, endMarkerId: string) => string;
  removeLoop: (id: string) => void;
  toggleLoopById: (id: string) => void;
  setActiveLoop: (id: string | null) => void;
  playLoop: (id: string) => void;
  toggleLoopPlayback: (id: string) => void;
  armLoop: (id: string | null) => void;
  enterArmedLoop: (time: number) => void;

  setWaveformStyle: (style: 'modern' | 'classic') => void;
  setWaveformNormalize: (normalize: boolean) => void;
  
  initAudioContext: () => void;

  // Piece management actions
  createPiece: (name: string) => Promise<string>;
  loadPiece: (id: string) => Promise<void>;
  deletePiece: (id: string) => Promise<void>;
  renamePiece: (id: string, name: string) => Promise<void>;
  listPieces: () => Promise<PieceWithStats[]>;
  getRecentPieces: (limit?: number) => Promise<PieceWithStats[]>;
  getCurrentPiece: () => Promise<PieceWithStats | null>;
  deleteAllPieces: () => Promise<void>;
  getTotalStorageSize: () => Promise<number>;
  cleanOrphanedData: () => Promise<{ filesDeleted: number; referencesRemoved: number }>;
}
