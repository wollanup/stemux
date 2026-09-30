import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AudioStore, AudioTrack } from '../../../types/audio';

vi.mock('../storage', () => ({ saveTrackSettingsToPiece: vi.fn(async () => {}) }));

const { createClipActions, loadSnapEnabled } = await import('../clips');
const { createHistoryActions } = await import('../history');
const { createLoopActions } = await import('../loops');

const track = (id: string): AudioTrack => ({ id, name: id, volume: 1, isMuted: false, isSolo: false, color: '#fff' });

let store: StoreApi<AudioStore>;

beforeEach(() => {
  localStorage.clear();
  store = createStore<AudioStore>()((set, get) => ({
    currentPieceId: null,
    armedLoopId: null,
    masterVolume: 1,
    playbackState: { isPlaying: false, currentTime: 0, duration: 60, playbackRate: 1 },
    loopState: { markers: [], loops: [], activeLoopId: null },
    tracks: [track('a'), track('b')],
    undoStack: [],
    redoStack: [],
    snapEnabled: true,
    seek: () => {},
    updateTrack: (id: string, updates: Partial<AudioTrack>) =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
    removeTrack: (id: string) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
    ...createClipActions(set, get),
    ...createLoopActions(set, get),
    ...createHistoryActions(set, get),
  }) as unknown as AudioStore);
});

const at = (offset: number, trimStart = 0, duration = 10) => ({ offset, trimStart, duration });
const clipOf = (id: string) => {
  const t = store.getState().tracks.find((x) => x.id === id)!;
  return [t.clipOffset, t.trimStart, t.clipDuration];
};
const times = () => store.getState().loopState.markers.map((m) => m.time);
const s = () => store.getState();

describe('clip edits', () => {
  it('stores the new clip window on the track', () => {
    s().updateClip('a', at(3, 1, 8));
    expect(clipOf('a')).toEqual([3, 1, 8]);
  });

  it('undoes and redoes, in order', () => {
    s().updateClip('a', at(3));
    s().updateClip('b', at(5));
    s().undo();
    expect(clipOf('b')).toEqual([undefined, undefined, undefined]);
    expect(clipOf('a')).toEqual([3, 0, 10]);
    s().undo();
    expect(clipOf('a')).toEqual([undefined, undefined, undefined]);
    s().redo();
    expect(clipOf('a')).toEqual([3, 0, 10]);
    s().redo();
    expect(clipOf('b')).toEqual([5, 0, 10]);
  });

  it('a new edit clears what could be redone', () => {
    s().updateClip('a', at(3));
    s().undo();
    s().updateClip('a', at(7));
    s().redo();
    expect(clipOf('a')).toEqual([7, 0, 10]);
  });

  it('skips edits of deleted tracks', () => {
    s().updateClip('a', at(3));
    s().updateClip('b', at(5));
    s().removeTrack('b');
    s().undo();
    expect(clipOf('a')).toEqual([undefined, undefined, undefined]);
  });

  it('does nothing with an empty history', () => {
    s().undo();
    s().redo();
    expect(clipOf('a')).toEqual([undefined, undefined, undefined]);
  });
});

describe('marker and loop edits', () => {
  it('undoes adding, moving and deleting a marker', () => {
    const id = s().addMarker(5);
    s().updateMarkerTime(id, 8);
    s().removeMarker(id);
    expect(times()).toEqual([]);
    s().undo();
    expect(times()).toEqual([8]);
    s().undo();
    expect(times()).toEqual([5]);
    s().undo();
    expect(times()).toEqual([]);
    s().redo();
    s().redo();
    expect(times()).toEqual([8]);
  });

  it('undoes a loop made of two markers in one step', () => {
    s().edit(() => {
      const a = s().addMarker(2);
      const b = s().addMarker(4);
      s().createLoop(a, b);
    });
    expect(s().undoStack).toHaveLength(1);
    s().undo();
    expect(s().loopState.loops).toEqual([]);
    expect(times()).toEqual([]);
    s().redo();
    expect(s().loopState.loops).toHaveLength(1);
    expect(times()).toEqual([2, 4]);
  });

  it('brings a deleted loop back, and moves of a loop', () => {
    const a = s().addMarker(2);
    const b = s().addMarker(4);
    const loop = s().createLoop(a, b);
    const color = s().loopState.loops[0].color;
    s().moveLoop(loop, 10);
    expect(times()).toEqual([12, 14]);
    s().removeLoop(loop);
    s().undo();
    expect(s().loopState.loops.map((l) => [l.id, l.color])).toEqual([[loop, color]]);
    s().undo();
    expect(times()).toEqual([2, 4]);
  });

  it('does not undo a color change, and keeps the new color when undoing a move', () => {
    const a = s().addMarker(2);
    const b = s().addMarker(4);
    const loop = s().createLoop(a, b);
    s().moveLoop(loop, 1);
    const entries = s().undoStack.length;
    s().setLoopColor(loop, '#123456');
    expect(s().undoStack).toHaveLength(entries);
    s().undo();
    expect(times()).toEqual([2, 4]);
    expect(s().loopState.loops[0].color).toBe('#123456');
  });

  it('does not undo enabling a loop, and keeps it enabled', () => {
    const a = s().addMarker(2);
    const b = s().addMarker(4);
    const loop = s().createLoop(a, b);
    s().setActiveLoop(loop);
    const entries = s().undoStack.length;
    s().moveLoop(loop, 1);
    s().undo();
    expect(s().undoStack).toHaveLength(entries);
    expect(s().loopState.activeLoopId).toBe(loop);
    expect(s().loopState.loops[0].enabled).toBe(true);
  });

  it('clears the active loop when undoing its creation', () => {
    const a = s().addMarker(2);
    const b = s().addMarker(4);
    const loop = s().createLoop(a, b);
    s().setActiveLoop(loop);
    s().undo();
    expect(s().loopState.loops).toEqual([]);
    expect(s().loopState.activeLoopId).toBeNull();
  });
});

describe('magnetism setting', () => {
  it('is on by default and remembered', () => {
    expect(loadSnapEnabled()).toBe(true);
    s().setSnapEnabled(false);
    expect(s().snapEnabled).toBe(false);
    expect(loadSnapEnabled()).toBe(false);
  });
});
