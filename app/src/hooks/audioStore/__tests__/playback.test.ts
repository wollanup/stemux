import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AudioStore, PieceSettings } from '../../../types/audio';

const db = vi.hoisted(() => ({ settings: new Map<string, unknown>() }));

vi.mock('../../../utils/indexedDB', () => ({
  savePieceSettings: async (id: string, settings: PieceSettings) => void db.settings.set(id, structuredClone(settings)),
}));
vi.mock('../../../audio/AudioEngine', () => ({ audioEngine: {} }));

const { createPlaybackActions } = await import('../playback');
const { setPitchSource } = await import('../storage');

const makeStore = () => {
  const store = createStore<AudioStore>()((set, get) => ({
    tracks: [],
    currentPieceId: 'p',
    loopState: { markers: [], loops: [], activeLoopId: null },
    playbackState: { isPlaying: false, currentTime: 0, duration: 180, playbackRate: 1 },
    masterVolume: 1,
    pitch: 0,
    ...createPlaybackActions(set, get),
  }) as unknown as AudioStore);
  setPitchSource(() => store.getState().pitch);
  return store;
};

describe('pitch shift', () => {
  beforeEach(() => db.settings.clear());

  it('is saved with the piece', async () => {
    const store = makeStore();
    store.getState().setPitch(-1.5);
    expect(store.getState().pitch).toBe(-1.5);
    await vi.waitFor(() => expect((db.settings.get('p') as PieceSettings).pitch).toBe(-1.5));
  });

  it('is kept within an octave either way', () => {
    const store = makeStore();
    store.getState().setPitch(-40);
    expect(store.getState().pitch).toBe(-12);
  });
});
