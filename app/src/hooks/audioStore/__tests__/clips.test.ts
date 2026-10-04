import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AudioStore, AudioTrack, PieceSettings } from '../../../types/audio';

const db = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  files: new Map<string, File>(),
}));

vi.mock('../../../utils/indexedDB', () => ({
  saveAudioFile: async (id: string, file: File) => void db.files.set(id, file),
  deleteAudioFile: async (id: string) => void db.files.delete(id),
  getPiece: async () => ({ id: 'p', name: 'p', createdAt: 0, updatedAt: 0, trackIds: [] }),
  savePiece: async () => undefined,
  savePieceSettings: async (id: string, settings: PieceSettings) => void db.settings.set(id, structuredClone(settings)),
}));
vi.mock('../../../audio/AudioEngine', () => ({ audioEngine: {} }));
vi.mock('../../../audio/micSession', () => ({ openMic: async () => ({}), closeMic: () => undefined }));
vi.mock('../../../i18n/config', () => ({ default: { t: (k: string) => k } }));

const { createRecordingActions } = await import('../recording');
const { createHistoryActions } = await import('../history');

const recordable: AudioTrack = {
  id: 'rec',
  name: 'take',
  volume: 0.8,
  isMuted: false,
  isSolo: false,
  color: '#fff',
  isRecordable: true,
  recordingState: 'stopped',
  recordingStartOffset: 30,
};

const makeStore = (tracks: AudioTrack[] = [recordable]) => {
  const seek = vi.fn();
  const store = createStore<AudioStore>()((set, get) => ({
    tracks,
    currentPieceId: 'p',
    loopState: { markers: [], loops: [], activeLoopId: null },
    playbackState: { isPlaying: false, currentTime: 0, duration: 180, playbackRate: 1 },
    masterVolume: 1,
    undoStack: [],
    redoStack: [],
    seek,
    updateTrack: (id: string, updates: Partial<AudioTrack>) =>
      set((state) => ({ tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
    ...createRecordingActions(set, get),
    ...createHistoryActions(set, get),
    // Stand-in: the real one also creates a piece and pauses
    addRecordableTrack: async () =>
      set((state) => ({ tracks: [...state.tracks, { ...recordable, id: `rec${state.tracks.length + 1}`, recordingState: 'idle' }] })),
  }) as unknown as AudioStore);
  return { store, seek };
};

/** clearRecording / saveRecording run in the background of undo / redo */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('recorded clips', () => {
  beforeEach(() => {
    db.settings.clear();
    db.files.clear();
  });

  it('keeps the clip position on the track and in the saved piece', async () => {
    const { store, seek } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 29.98);

    expect(store.getState().tracks[0].clipOffset).toBe(29.98);
    const saved = db.settings.get('p') as PieceSettings;
    expect(saved.trackSettings[0].clipOffset).toBe(29.98);
    // Back to where the take started, ready to listen
    expect(seek).toHaveBeenCalledWith(30);
  });

  it('saves the track height with the piece', async () => {
    const { store } = makeStore();
    store.setState({ tracks: [{ ...recordable, height: 180 }] });
    await store.getState().saveRecording('rec', new Blob(['wav']), 0);
    expect((db.settings.get('p') as PieceSettings).trackSettings[0].height).toBe(180);
  });

  it('forgets the clip position when the recording is cleared', async () => {
    const { store } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 12);
    await store.getState().clearRecording('rec');

    expect(store.getState().tracks[0].clipOffset).toBeUndefined();
    expect((db.settings.get('p') as PieceSettings).trackSettings[0].clipOffset).toBeUndefined();
  });

  it('remembers the pitch a take was recorded at, and forgets it when cleared', async () => {
    const { store } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 0, 2.15);
    expect(store.getState().tracks[0].recordedPitch).toBe(2.15);
    expect((db.settings.get('p') as PieceSettings).trackSettings[0].recordedPitch).toBe(2.15);

    await store.getState().clearRecording('rec');
    expect(store.getState().tracks[0].recordedPitch).toBeUndefined();
    expect((db.settings.get('p') as PieceSettings).trackSettings[0].recordedPitch).toBeUndefined();
  });
});

describe('quick retry: space, ctrl+Z, R, space', () => {
  beforeEach(() => {
    db.settings.clear();
    db.files.clear();
  });

  it('undoes the last take, and redoes it', async () => {
    const { store } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 12, 2);

    store.getState().undo();
    await settle();
    expect(store.getState().tracks[0].file).toBeUndefined();
    expect(db.files.has('rec')).toBe(false);

    store.getState().redo();
    await settle();
    const track = store.getState().tracks[0];
    expect(track.file).toBeDefined();
    expect(track.clipOffset).toBe(12);
    expect(track.recordedPitch).toBe(2);
    expect(db.files.has('rec')).toBe(true);
  });

  it('undoes clip edits made after the take first', async () => {
    const { store } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 12);
    store.getState().edit(() => store.getState().updateTrack('rec', { clipOffset: 20 }));

    store.getState().undo();
    await settle();
    expect(store.getState().tracks[0]).toMatchObject({ clipOffset: 12 });
    expect(store.getState().tracks[0].file).toBeDefined();

    store.getState().undo();
    await settle();
    expect(store.getState().tracks[0].file).toBeUndefined();
  });

  it('R arms the track whose take was undone, and disarms it on a second press', async () => {
    const other: AudioTrack = { ...recordable, id: 'free', recordingState: 'idle' };
    const { store } = makeStore([other, { ...recordable, recordingState: 'idle' }]);
    store.getState().toggleRecordArm('rec');
    store.getState().toggleRecordArm('rec');
    await store.getState().saveRecording('rec', new Blob(['wav']), 0);
    store.getState().undo();
    await settle();

    await store.getState().armNextRecording();
    expect(store.getState().tracks.find((t) => t.isArmed)?.id).toBe('rec');
    await store.getState().armNextRecording();
    expect(store.getState().tracks.some((t) => t.isArmed)).toBe(false);
  });

  it('R adds a recording track when every one already has a take', async () => {
    const { store } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 0);
    await store.getState().armNextRecording();
    const tracks = store.getState().tracks;
    expect(tracks).toHaveLength(2);
    expect(tracks[1].isArmed).toBe(true);
  });
});
