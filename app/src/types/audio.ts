import type { ClipGeometry } from '../timeline/clipEdit';
import type { HistoryEntry } from '../hooks/audioStore/history';
import type { PitchShift } from '../audio/pitch';

export interface AudioTrack {
  id: string;
  name: string;
  file?: File; // Optional for recordable tracks
  volume: number; // 0-1
  pan?: number; // -1 left, 0 center, 1 right (undefined: center)
  reverb?: number; // Reverb send 0-1, recording tracks only (undefined: none)
  reverbEnabled?: boolean; // Reverb on/off, keeps the amount (undefined: on)
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
  recordingPitch?: number; // Pitch shift (semitones) when the take in progress started
  recordedPitch?: number; // Pitch shift (semitones) the take was recorded at (undefined: none)
  clipOffset?: number; // Position of the clip on the timeline (seconds), 0 = start of the piece
  trimStart?: number; // Seconds of the file skipped at the start of the clip
  clipDuration?: number; // Seconds of the file played (undefined: until its end)
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

/** Constant tempo of a piece (see tempo/tempo.ts) */
export interface Tempo {
  /** Beats per minute, a beat being the unit of the signature */
  bpm: number;
  /** Time signature: beats per bar / beat unit (4/4, 3/4, 6/8...) */
  beatsPerBar: number;
  beatUnit: number;
  /** Time of the first beat of bar 1 (seconds) */
  offset: number;
}

// Piece (morceau) types
export interface PieceSettings {
  trackSettings: Array<{
    id: string;
    name: string;
    volume: number;
    pan?: number;
    reverb?: number;
    reverbEnabled?: boolean;
    isMuted: boolean;
    isSolo: boolean;
    color: string;
    isCollapsed?: boolean;
    height?: number;
    isRecordable?: boolean; // Track is a recording track
    recordedPitch?: number;
    clipOffset?: number; // Position of the clip on the timeline (seconds)
    trimStart?: number;
    clipDuration?: number;
  }>;
  loopState: {
    markers: Marker[];
    loops: Loop[];
    activeLoopId: string | null;
  };
  playbackRate: number;
  masterVolume: number;
  tempo?: Tempo | null; // Missing on pieces saved before tempo existed
  pitch?: PitchShift; // Missing on pieces saved before pitch shift existed
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

  // Clip editing
  snapEnabled: boolean;
  /** Drag on a lane: move/trim clips (true) or scroll the timeline (false) */
  editMode: boolean;
  setEditMode: (enabled: boolean) => void;
  updateClip: (trackId: string, clip: ClipGeometry) => void;
  setSnapEnabled: (enabled: boolean) => void;

  // Tempo grid of the piece (null: none) and ruler display
  tempo: Tempo | null;
  setTempo: (tempo: Tempo | null) => void;
  rulerMode: 'time' | 'bars';
  setRulerMode: (mode: 'time' | 'bars') => void;

  // Undo / redo of markers, loops and clips
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Run an edit (or several at once) and record it for undo */
  edit: <T>(fn: () => T) => T;
  undo: () => void;
  redo: () => void;
  /** A take was just saved: the next undo removes it (unless edits come after) */
  takeRecorded: (trackId: string) => void;
  
  addTrack: (file: File) => Promise<void>;
  removeTrack: (id: string) => void;
  removeAllTracks: () => void;
  updateTrack: (id: string, updates: Partial<AudioTrack>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  setVolume: (id: string, volume: number) => void;
  setPan: (id: string, pan: number) => void;
  setReverb: (id: string, reverb: number) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  exclusiveSolo: (id: string) => void;
  unmuteAll: () => void;
  
  // Recording actions
  addRecordableTrack: () => Promise<void>;
  toggleRecordArm: (trackId: string) => void;
  /** R key: arms the recording track to use next (or disarms the armed one) */
  armNextRecording: () => Promise<void>;
  startRecording: (trackId: string, ctxTime: number) => Promise<void>;
  stopRecording: (trackId: string) => Promise<void>;
  saveRecording: (trackId: string, blob: Blob, clipOffset?: number, recordedPitch?: number) => Promise<void>;
  clearRecording: (trackId: string) => Promise<void>;
  
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  /** Transpose the whole piece, tempo unchanged (see audio/pitch.ts) */
  pitch: PitchShift;
  setPitch: (pitch: PitchShift) => void;
  setMasterVolume: (volume: number) => void;
  

  // Loop v2 actions
  addMarker: (time: number, label?: string) => string;
  removeMarker: (id: string) => void;
  updateMarkerTime: (id: string, time: number) => void;
  moveLoop: (id: string, delta: number) => void;
  createLoop: (startMarkerId: string, endMarkerId: string) => string;
  removeLoop: (id: string) => void;
  setLoopColor: (id: string, color: string) => void;
  toggleLoopById: (id: string) => void;
  setActiveLoop: (id: string | null) => void;
  playLoop: (id: string) => void;
  toggleLoopPlayback: (id: string) => void;
  armLoop: (id: string | null) => void;
  enterArmedLoop: (time: number) => void;

  setWaveformStyle: (style: 'modern' | 'classic') => void;
  setWaveformNormalize: (normalize: boolean) => void;
  /** Markers and loops panel shown: the loop strip is editable (read-only when hidden) */
  loopsPanelOpen: boolean;
  setLoopsPanelOpen: (open: boolean) => void;
  
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
