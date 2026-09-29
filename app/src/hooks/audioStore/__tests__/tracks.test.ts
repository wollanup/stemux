import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AudioStore, Piece } from '../../../types/audio';

// In-memory IndexedDB. Every call resolves on a later macrotask, like the real
// thing, so concurrent callers get the chance to interleave.
const db = vi.hoisted(() => ({
  pieces: new Map<string, unknown>(),
  files: new Map<string, File>(),
}));

vi.mock('../../../utils/indexedDB', () => {
  const later = <T>(fn: () => T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(fn())));
  const clone = <T>(value: T): T => structuredClone(value);
  return {
    savePiece: (piece: Piece) => later(() => void db.pieces.set(piece.id, clone(piece))),
    getPiece: (id: string) => later(() => {
      const piece = db.pieces.get(id);
      return piece ? clone(piece) : undefined;
    }),
    savePieceSettings: () => later(() => undefined),
    saveAudioFile: (id: string, file: File) => later(() => void db.files.set(id, file)),
  };
});
vi.mock('../storage', () => ({
  saveTrackSettingsToPiece: vi.fn(async () => {}),
  cleanOrphanedData: vi.fn(async () => {}),
}));
vi.mock('../../../audio/AudioEngine', () => ({ audioEngine: {} }));

const alertMock = vi.fn();
vi.stubGlobal('alert', alertMock);

const { createTrackActions } = await import('../tracks');
const { createPieceActions } = await import('../pieces');

const makeStore = () =>
  createStore<AudioStore>()((set, get) => ({
    tracks: [],
    currentPieceId: null,
    currentPieceName: '',
    loopState: { editMode: false, markers: [], loops: [], activeLoopId: null },
    playbackState: { isPlaying: false, currentTime: 0, duration: 0, playbackRate: 1 },
    masterVolume: 1,
    pause: () => {},
    seek: () => {},
    ...createTrackActions(set, get),
    ...createPieceActions(set, get),
  }) as unknown as AudioStore);

const audioFile = (name: string) => new File(['x'], name, { type: 'audio/wav' });

// Callers (TrackAdder, drop zones) fire addTrack for each file without awaiting
const importAtOnce = (store: StoreApi<AudioStore>, names: string[]) =>
  Promise.all(names.map((name) => store.getState().addTrack(audioFile(name))));

describe('addTrack with several files at once', () => {
  beforeEach(() => {
    db.pieces.clear();
    db.files.clear();
    alertMock.mockClear();
  });

  it('puts every file in a single new piece', async () => {
    const store = makeStore();

    await importAtOnce(store, ['a.wav', 'b.wav', 'c.wav']);

    const { tracks, currentPieceId } = store.getState();
    expect(tracks.map((t) => t.name)).toEqual(['a.wav', 'b.wav', 'c.wav']);
    expect(tracks.every((t) => !t.isLoading)).toBe(true);
    expect(new Set(tracks.map((t) => t.color)).size).toBe(3);

    expect(db.pieces.size).toBe(1);
    const piece = db.pieces.get(currentPieceId!) as Piece;
    expect(piece.trackIds).toEqual(tracks.map((t) => t.id));
    expect([...db.files.keys()]).toEqual(piece.trackIds);
  });

  it('adds to the current piece without losing piece.trackIds updates', async () => {
    const store = makeStore();
    await importAtOnce(store, ['a.wav']);
    const pieceId = store.getState().currentPieceId;

    await importAtOnce(store, ['b.wav', 'c.wav']);

    expect(db.pieces.size).toBe(1);
    expect(store.getState().currentPieceId).toBe(pieceId);
    expect((db.pieces.get(pieceId!) as Piece).trackIds).toEqual(
      store.getState().tracks.map((t) => t.id)
    );
  });

  it('enforces the 8-track limit against the live track count', async () => {
    const store = makeStore();

    await importAtOnce(store, Array.from({ length: 10 }, (_, i) => `${i}.wav`));

    const { tracks, currentPieceId } = store.getState();
    expect(tracks).toHaveLength(8);
    expect((db.pieces.get(currentPieceId!) as Piece).trackIds).toHaveLength(8);
    expect(alertMock).toHaveBeenCalledTimes(2);
  });

  it('keeps processing the queue after a failed addition', async () => {
    const store = makeStore();
    const { createPiece } = store.getState();
    store.setState({
      createPiece: vi.fn().mockRejectedValueOnce(new Error('quota')).mockImplementation(createPiece),
    });

    const first = store.getState().addTrack(audioFile('a.wav'));
    const second = store.getState().addTrack(audioFile('b.wav'));

    await expect(first).rejects.toThrow('quota');
    await second;
    expect(store.getState().tracks.map((t) => t.name)).toEqual(['b.wav']);
  });
});

describe('piece created by the first import', () => {
  beforeEach(() => db.pieces.clear());

  it('becomes the current piece with its name', async () => {
    const store = makeStore();

    await importAtOnce(store, ['a.wav']);

    const { currentPieceId, currentPieceName } = store.getState();
    const piece = db.pieces.get(currentPieceId!) as Piece;
    expect(currentPieceName).not.toBe('');
    expect(currentPieceName).toBe(piece.name);
  });
});
