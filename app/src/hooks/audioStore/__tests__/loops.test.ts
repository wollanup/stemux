import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AudioStore } from '../../../types/audio';

vi.mock('../storage', () => ({ saveTrackSettingsToPiece: vi.fn(async () => {}) }));

const { createLoopActions } = await import('../loops');
const { createHistoryActions } = await import('../history');
const { LOOP_COLORS } = await import('../../../utils/colors');

/** Loop 2 is made of a start marker placed AFTER its end marker */
const makeStore = (isPlaying = false) => {
  const calls: string[] = [];
  const store = createStore<AudioStore>()((set, get) => ({
    currentPieceId: null,
    armedLoopId: null,
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
    undoStack: [],
    redoStack: [],
    ...createLoopActions(set, get),
    ...createHistoryActions(set, get),
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

describe('moving loops', () => {
  const times = (store: ReturnType<typeof makeStore>['store']) =>
    Object.fromEntries(store.getState().loopState.markers.map((m) => [m.id, m.time]));

  it('moves both markers of the loop, and only them', () => {
    const { store } = makeStore();
    store.getState().moveLoop('l1', 5);
    expect(times(store)).toEqual({ a: 15, b: 25, c: 40, d: 30 });
  });

  it('keeps the loop within the piece', () => {
    const { store } = makeStore();
    store.getState().moveLoop('l1', -100);
    expect(times(store)).toMatchObject({ a: 0, b: 10 });
    // l2 spans 30-40 with its start marker after its end marker
    store.getState().moveLoop('l2', 100);
    expect(times(store)).toMatchObject({ c: 60, d: 50 });
  });
});

describe('loop colors', () => {
  it('gives each new loop a color no other loop uses', () => {
    const { store } = makeStore();
    const s = store.getState();
    const id = s.createLoop('b', 'd');
    const loops = store.getState().loopState.loops;
    // l1 and l2 have no saved color: they use the first two of the palette
    expect(loops.find((l) => l.id === id)?.color).toBe(LOOP_COLORS[2]);
  });
});

describe('loop on entry', () => {
  it('enables the armed loop once the playhead is inside, without seeking', () => {
    const { store, calls } = makeStore(true);
    store.getState().armLoop('l1');
    store.getState().enterArmedLoop(9.9);
    expect(store.getState().loopState.activeLoopId).toBeNull();
    store.getState().enterArmedLoop(10.02);
    expect(store.getState().loopState.activeLoopId).toBe('l1');
    expect(store.getState().loopState.loops.find((l) => l.id === 'l1')?.enabled).toBe(true);
    expect(store.getState().armedLoopId).toBeNull();
    expect(calls).toEqual([]);
  });

  it('works whatever the order of the loop markers', () => {
    const { store } = makeStore(true);
    store.getState().armLoop('l2');
    store.getState().enterArmedLoop(35);
    expect(store.getState().loopState.activeLoopId).toBe('l2');
  });

  it('is cancelled by playing a loop or deleting the armed one', () => {
    const { store } = makeStore();
    store.getState().armLoop('l2');
    store.getState().playLoop('l1');
    expect(store.getState().armedLoopId).toBeNull();

    store.getState().armLoop('l2');
    store.getState().removeLoop('l2');
    expect(store.getState().armedLoopId).toBeNull();
  });

  it('stays armed while the loop playing is left with "continue past the loop"', () => {
    const { store } = makeStore(true);
    store.getState().playLoop('l1');
    store.getState().armLoop('l2');
    store.getState().setActiveLoop(null);
    expect(store.getState().armedLoopId).toBe('l2');
  });
});
