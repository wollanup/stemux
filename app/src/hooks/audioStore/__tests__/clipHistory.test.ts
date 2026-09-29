import { beforeEach, describe, expect, it } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AudioStore, AudioTrack } from '../../../types/audio';
import { createClipActions, loadSnapEnabled } from '../clips';

const track = (id: string): AudioTrack => ({ id, name: id, volume: 1, isMuted: false, isSolo: false, color: '#fff' });

let store: StoreApi<AudioStore>;

beforeEach(() => {
  localStorage.clear();
  store = createStore<AudioStore>()((set, get) => ({
    tracks: [track('a'), track('b')],
    clipUndo: [],
    clipRedo: [],
    snapEnabled: true,
    updateTrack: (id: string, updates: Partial<AudioTrack>) =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
    removeTrack: (id: string) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
    ...createClipActions(set, get),
  }) as unknown as AudioStore);
});

const at = (offset: number, trimStart = 0, duration = 10) => ({ offset, trimStart, duration });
const clipOf = (id: string) => {
  const t = store.getState().tracks.find((x) => x.id === id)!;
  return [t.clipOffset, t.trimStart, t.clipDuration];
};

describe('clip edits', () => {
  it('stores the new clip window on the track', () => {
    store.getState().updateClip('a', at(0), at(3, 1, 8));
    expect(clipOf('a')).toEqual([3, 1, 8]);
  });

  it('undoes and redoes, in order', () => {
    store.getState().updateClip('a', at(0), at(3));
    store.getState().updateClip('b', at(0), at(5));
    store.getState().undoClipEdit();
    expect(clipOf('b')).toEqual([0, 0, 10]);
    store.getState().undoClipEdit();
    expect(clipOf('a')).toEqual([0, 0, 10]);
    store.getState().redoClipEdit();
    expect(clipOf('a')).toEqual([3, 0, 10]);
    store.getState().redoClipEdit();
    expect(clipOf('b')).toEqual([5, 0, 10]);
  });

  it('a new edit clears what could be redone', () => {
    store.getState().updateClip('a', at(0), at(3));
    store.getState().undoClipEdit();
    store.getState().updateClip('a', at(0), at(7));
    store.getState().redoClipEdit();
    expect(clipOf('a')).toEqual([7, 0, 10]);
  });

  it('skips edits of deleted tracks', () => {
    store.getState().updateClip('a', at(0), at(3));
    store.getState().updateClip('b', at(0), at(5));
    store.getState().removeTrack('b');
    store.getState().undoClipEdit();
    expect(clipOf('a')).toEqual([0, 0, 10]);
  });

  it('does nothing with an empty history', () => {
    store.getState().undoClipEdit();
    store.getState().redoClipEdit();
    expect(clipOf('a')).toEqual([undefined, undefined, undefined]);
  });
});

describe('magnetism setting', () => {
  it('is on by default and remembered', () => {
    expect(loadSnapEnabled()).toBe(true);
    store.getState().setSnapEnabled(false);
    expect(store.getState().snapEnabled).toBe(false);
    expect(loadSnapEnabled()).toBe(false);
  });
});
