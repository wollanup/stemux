import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AudioStore } from '../../../types/audio';

vi.mock('../storage', () => ({ saveTrackSettingsToPiece: vi.fn(async () => {}) }));

const { createLoopActions } = await import('../loops');

/** Loop 2 is made of a start marker placed AFTER its end marker */
const makeStore = (isPlaying = false) => {
  const calls: string[] = [];
  const store = createStore<AudioStore>()((set, get) => ({
    currentPieceId: null,
    tracks: [],
    masterVolume: 1,
    playbackState: { isPlaying, currentTime: 0, duration: 60, playbackRate: 1 },
    loopState: {
      markers: [
        { id: 'a', time: 10, createdAt: 0 },
        { id: 'b', time: 20, createdAt: 0 },
        { id: 'c', time: 40, createdAt: 0 },
        { id: 'd', time: 30, createdAt: 0 },
      ],
      loops: [
        { id: 'l1', startMarkerId: 'a', endMarkerId: 'b', enabled: false, createdAt: 0 },
        { id: 'l2', startMarkerId: 'c', endMarkerId: 'd', enabled: false, createdAt: 0 },
      ],
      activeLoopId: null,
    },
    seek: (time: number) => calls.push(`seek ${time}`),
    play: () => {
      calls.push('play');
      set((s) => ({ playbackState: { ...s.playbackState, isPlaying: true } }));
    },
    pause: () => {
      calls.push('pause');
      set((s) => ({ playbackState: { ...s.playbackState, isPlaying: false } }));
    },
    ...createLoopActions(set, get),
  }) as unknown as AudioStore);
  return { store, calls };
};

describe('playing loops', () => {
  it('enables the loop and plays it from its earliest marker', () => {
    const { store, calls } = makeStore();
    store.getState().playLoop('l2');
    expect(store.getState().loopState.activeLoopId).toBe('l2');
    expect(store.getState().loopState.loops.find((l) => l.id === 'l2')?.enabled).toBe(true);
    expect(calls).toEqual(['seek 30', 'play']);
  });

  it('loop chip: a click plays the loop, a second click pauses it', () => {
    const { store, calls } = makeStore();
    store.getState().toggleLoopPlayback('l1');
    expect(calls).toEqual(['seek 10', 'play']);
    store.getState().toggleLoopPlayback('l1');
    expect(calls).toEqual(['seek 10', 'play', 'pause']);
    // The loop stays enabled while paused
    expect(store.getState().loopState.activeLoopId).toBe('l1');
  });

  it('loop chip: clicking another loop while playing switches to it', () => {
    const { store, calls } = makeStore();
    store.getState().toggleLoopPlayback('l1');
    store.getState().toggleLoopPlayback('l2');
    expect(store.getState().loopState.activeLoopId).toBe('l2');
    expect(calls).toEqual(['seek 10', 'play', 'seek 30']);
  });
});
