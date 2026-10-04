import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeStretchNode, fakeBuffer } from '../../test/fakeWebAudio';
import { AudioEngine } from '../AudioEngine';

const stretchNodes: FakeStretchNode[] = [];
vi.mock('signalsmith-stretch', () => ({
  default: vi.fn(async () => {
    const node = new FakeStretchNode();
    stretchNodes.push(node);
    return node;
  }),
}));

let ctx: FakeAudioContext;
let engine: AudioEngine;

/** Moves the audio clock and runs the engine scheduler once */
const advanceTo = (time: number) => {
  ctx.currentTime = time;
  vi.advanceTimersByTime(20);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', vi.fn(function () {
    ctx = new FakeAudioContext();
    return ctx;
  }));
  stretchNodes.length = 0;
  engine = new AudioEngine();
  engine.getContext();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AudioEngine transport', () => {
  it('starts every track on the same AudioContext time', () => {
    ctx.currentTime = 1;
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(8));

    const start = engine.play();

    const starts = ctx.startedSources().map((s) => s.startArgs);
    expect(starts).toHaveLength(2);
    expect(start.ctxTime).toBeGreaterThan(1);
    starts.forEach((args) => {
      expect(args).toEqual({ when: start.ctxTime, offset: 0 });
    });
  });

  it('derives the position from the audio clock', () => {
    engine.addTrack('a', fakeBuffer(10));
    const start = engine.play();

    // Before audio actually starts, the position does not move
    expect(engine.getCurrentTime()).toBe(0);

    ctx.currentTime = start.ctxTime + 2.5;
    expect(engine.getCurrentTime()).toBeCloseTo(2.5, 9);
  });

  it('pauses and resumes at the same position', () => {
    engine.addTrack('a', fakeBuffer(10));
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 2;
    engine.pause();

    const first = ctx.startedSources()[0];
    expect(first.stopTime).toBe(ctx.currentTime);

    ctx.currentTime = 50;
    expect(engine.getCurrentTime()).toBeCloseTo(2, 9);

    const resumed = engine.play();
    expect(resumed.pos).toBeCloseTo(2, 9);
    expect(ctx.startedSources()[1].startArgs).toEqual({ when: resumed.ctxTime, offset: resumed.pos });
  });

  it('seeks while playing without a gap and keeps tracks together', () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(10));
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 1;

    engine.seek(5);

    const [oldA, oldB, newA, newB] = ctx.startedSources();
    const when = newA.startArgs!.when;
    // Old voices stop exactly where the new ones start
    expect(oldA.stopTime).toBe(when);
    expect(oldB.stopTime).toBe(when);
    expect(newA.startArgs).toEqual({ when, offset: 5 });
    expect(newB.startArgs).toEqual({ when, offset: 5 });

    ctx.currentTime = when + 1;
    expect(engine.getCurrentTime()).toBeCloseTo(6, 9);
  });

  it('seeks while paused without starting audio', () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.seek(4);
    expect(engine.getCurrentTime()).toBe(4);
    expect(ctx.startedSources()).toHaveLength(0);
  });

  it('makes a track added during playback join in sync', () => {
    engine.addTrack('a', fakeBuffer(10));
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 3;

    engine.addTrack('late', fakeBuffer(10));

    const joined = ctx.startedSources()[1].startArgs!;
    // Its offset is the transport position at its own start time
    expect(joined.offset).toBeCloseTo(joined.when - start.ctxTime, 9);
  });

  it('does not start a track whose audio ended before the position', () => {
    engine.addTrack('long', fakeBuffer(10));
    engine.addTrack('short', fakeBuffer(4));
    engine.seek(6);
    engine.play();
    expect(ctx.startedSources()).toHaveLength(1);
    expect(ctx.startedSources()[0].buffer!.duration).toBe(10);
  });

  it('plays a clip placed later on the timeline at the right time', () => {
    engine.addTrack('clip', fakeBuffer(5), { offset: 2 });
    expect(engine.getDuration()).toBe(7);

    const start = engine.play();
    expect(ctx.startedSources()[0].startArgs).toEqual({ when: start.ctxTime + 2, offset: 0 });

    engine.pause();
    engine.seek(3);
    const resumed = engine.play();
    expect(ctx.startedSources()[1].startArgs).toEqual({ when: resumed.ctxTime, offset: 1 });
  });

  it('plays only the kept part of a trimmed clip', () => {
    // 10s file, 2s cut at the start, 5s kept, placed at 1s on the timeline
    engine.addTrack('t', fakeBuffer(10), { offset: 1, trimStart: 2, duration: 5 });
    expect(engine.getTrackDuration('t')).toBe(6);
    expect(engine.getDuration()).toBe(6);

    engine.seek(3);
    const start = engine.play();
    // 2s into the clip → 4s into the file, 3s left to play
    expect(ctx.startedSources()[0].startArgs).toEqual({ when: start.ctxTime, offset: 4 });
    expect(ctx.startedSources()[0].duration).toBe(3);
  });

  it('does not play a trimmed clip once its kept part is over', () => {
    engine.addTrack('long', fakeBuffer(20));
    engine.addTrack('t', fakeBuffer(10), { offset: 0, trimStart: 0, duration: 4 });
    engine.seek(5);
    engine.play();
    expect(ctx.startedSources()).toHaveLength(1);
    expect(ctx.startedSources()[0].buffer!.duration).toBe(20);
  });

  it('keeps the clip window within the file', () => {
    engine.addTrack('t', fakeBuffer(10), { offset: -3, trimStart: 8, duration: 5 });
    // Offset clamped to 0, only 2s left after the cut
    expect(engine.getTrackDuration('t')).toBe(2);
  });

  it('moves a clip while playing without touching the other tracks', () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(10));
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 2;

    engine.setClip('b', { offset: 1, trimStart: 0 });

    const [a, oldB, newB] = ctx.startedSources();
    expect(a.stopTime).toBeNull();
    const when = newB.startArgs!.when;
    expect(oldB.stopTime).toBe(when);
    // Position 2.05s on the timeline = 1.05s into the moved clip
    expect(newB.startArgs!.offset).toBeCloseTo(when - start.ctxTime - 1, 9);
  });

  it('ignores a setClip that changes nothing', () => {
    engine.addTrack('a', fakeBuffer(10), { offset: 2 });
    engine.play();
    engine.setClip('a', { offset: 2, trimStart: 0 });
    expect(ctx.startedSources()).toHaveLength(1);
  });

  it('applies gains set before the track is loaded', () => {
    engine.setTrackGain('a', 0.25);
    engine.addTrack('a', fakeBuffer(10));
    engine.play();
    const gainNode = [...ctx.startedSources()[0].connections][0] as { gain: { value: number } };
    expect(gainNode.gain.value).toBe(0.25);
  });

  it('emits "ended" once at the end of the longest track', () => {
    const ended = vi.fn();
    engine.on('ended', ended);
    engine.addTrack('a', fakeBuffer(4));
    engine.addTrack('b', fakeBuffer(6));
    const start = engine.play();

    advanceTo(start.ctxTime + 5);
    expect(ended).not.toHaveBeenCalled();

    advanceTo(start.ctxTime + 6.1);
    advanceTo(start.ctxTime + 6.2);
    expect(ended).toHaveBeenCalledTimes(1);
  });
});

describe('AudioEngine reverb', () => {
  const gainOf = (id: string) => {
    engine.play();
    const source = ctx.startedSources().find((s) => s.buffer === engine.getTrackBuffer(id))!;
    return [...source.connections][0] as { connections: Set<unknown> };
  };

  it('creates no reverb while no track uses it', () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.setTrackReverb('a', 0);
    expect(ctx.convolvers).toHaveLength(0);
  });

  it('sends a track after its volume to one shared reverb', () => {
    engine.setTrackReverb('a', 0.4); // set before loading, like gains
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(10));
    engine.setTrackReverb('b', 0.7);

    expect(ctx.convolvers).toHaveLength(1);
    expect(ctx.convolvers[0].buffer!.numberOfChannels).toBe(2);
    type Node = { gain?: { value: number }; connections: Set<unknown> };
    // The send: the node after the track gain that leads to the convolver
    const sendOf = (id: string) =>
      [...gainOf(id).connections].find((n) =>
        [...(n as Node).connections].some((next) => (next as Node).connections?.has(ctx.convolvers[0]))
      ) as Required<Node>;
    expect(sendOf('a').gain.value).toBe(0.4);
    expect(sendOf('b').gain.value).toBe(0.7);
    const bus = [...sendOf('a').connections][0] as { connections: Set<unknown> };
    expect([...sendOf('b').connections][0]).toBe(bus);
    expect(bus.connections.has(ctx.convolvers[0])).toBe(true);
  });
});

describe('AudioEngine loops', () => {
  it('schedules a sample-accurate jump back to the loop start', () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(10));
    engine.setLoop({ start: 1, end: 2 });
    const start = engine.play();
    const loopEndTime = start.ctxTime + 2;

    // Within the look-ahead window before the loop end
    advanceTo(loopEndTime - 0.1);

    const sources = ctx.startedSources();
    expect(sources).toHaveLength(4);
    const [oldA, oldB, jumpA, jumpB] = sources;
    expect(oldA.stopTime).toBeCloseTo(loopEndTime, 9);
    expect(oldB.stopTime).toBeCloseTo(loopEndTime, 9);
    expect(jumpA.startArgs!.when).toBeCloseTo(loopEndTime, 9);
    expect(jumpA.startArgs!.offset).toBe(1);
    expect(jumpB.startArgs).toEqual(jumpA.startArgs);

    // Position is still before the loop end until the jump happens
    expect(engine.getCurrentTime()).toBeCloseTo(1.9, 9);
    ctx.currentTime = loopEndTime + 0.5;
    expect(engine.getCurrentTime()).toBeCloseTo(1.5, 9);
  });

  it('jumps immediately when the position is already past the loop end', () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.seek(5);
    const start = engine.play();
    engine.setLoop({ start: 1, end: 2 });

    advanceTo(start.ctxTime + 0.1);

    const last = ctx.startedSources().at(-1)!;
    expect(last.startArgs!.offset).toBe(1);
  });

  it('does not emit "ended" while looping', () => {
    const ended = vi.fn();
    engine.on('ended', ended);
    engine.addTrack('a', fakeBuffer(3));
    engine.setLoop({ start: 1, end: 3 });
    const start = engine.play();
    for (let t = 0; t < 10; t += 0.05) advanceTo(start.ctxTime + t);
    expect(ended).not.toHaveBeenCalled();
  });
});

describe('AudioEngine playback rate', () => {
  it('switches every track to time-stretch voices on the same clock time', async () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(10));
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 2;

    await engine.setPlaybackRate(0.5);

    expect(stretchNodes).toHaveLength(2);
    const [schedA, schedB] = stretchNodes.map((n) => n.schedules.at(-1)!);
    expect(schedA).toEqual(schedB);
    expect(schedA.active).toBe(true);
    expect(schedA.rate).toBe(0.5);
    const when = schedA.output as number;
    expect(schedA.input).toBeCloseTo(when - start.ctxTime, 9);

    // The 1x voices stop exactly when the stretched ones start
    ctx.startedSources().forEach((s) => expect(s.stopTime).toBe(when));

    // Position now advances at half speed
    ctx.currentTime = when + 2;
    expect(engine.getCurrentTime()).toBeCloseTo((schedA.input as number) + 1, 9);
  });

  it('loads each track audio into its stretch node', async () => {
    engine.addTrack('a', fakeBuffer(1, 48000, 2));
    await engine.setPlaybackRate(1.5);
    expect(stretchNodes[0].buffers[0]).toHaveLength(2);
  });

  it('gives the stretch node only the kept part of a trimmed clip', async () => {
    engine.addTrack('a', fakeBuffer(10, 1000), { trimStart: 2, duration: 3 });
    await engine.setPlaybackRate(0.5);
    expect(stretchNodes[0].buffers[0][0]).toHaveLength(3000);
  });

  it('rebuilds the stretch node when the clip is trimmed', async () => {
    engine.addTrack('a', fakeBuffer(10, 1000));
    await engine.setPlaybackRate(0.5);
    engine.setClip('a', { trimStart: 1, duration: 4 });
    await vi.waitFor(() => expect(stretchNodes).toHaveLength(2));
    await vi.waitFor(() => expect(stretchNodes[1].buffers[0]?.[0]).toHaveLength(4000));
  });

  it('goes back to plain buffer playback at 1x', async () => {
    engine.addTrack('a', fakeBuffer(10));
    await engine.setPlaybackRate(0.75);
    const start = engine.play();
    expect(ctx.startedSources()).toHaveLength(0);

    ctx.currentTime = start.ctxTime + 1;
    await engine.setPlaybackRate(1);

    expect(engine.getPlaybackRate()).toBe(1);
    expect(stretchNodes[0].schedules.at(-1)!.active).toBe(false);
    const source = ctx.startedSources()[0];
    expect(source.startArgs!.when).toBe(stretchNodes[0].schedules.at(-1)!.output);
  });
});

describe('AudioEngine pitch shift', () => {
  it('transposes through stretch voices without changing the speed', async () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.addTrack('b', fakeBuffer(10));
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 2;

    await engine.setPitch(-1);

    const [schedA, schedB] = stretchNodes.map((n) => n.schedules.at(-1)!);
    expect(schedA).toEqual(schedB);
    expect(schedA).toMatchObject({ active: true, rate: 1, semitones: -1 });
    const when = schedA.output as number;
    expect(schedA.input).toBeCloseTo(when - start.ctxTime, 9);
    ctx.startedSources().forEach((s) => expect(s.stopTime).toBe(when));

    // Still 1x
    ctx.currentTime = when + 2;
    expect(engine.getCurrentTime()).toBeCloseTo((schedA.input as number) + 2, 9);
  });

  it('retunes in place, continuing from the same position', async () => {
    engine.addTrack('a', fakeBuffer(10));
    await engine.setPitch(2);
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 1;

    await engine.setPitch(2.15);

    expect(stretchNodes).toHaveLength(1);
    const sched = stretchNodes[0].schedules.at(-1)!;
    expect(sched).toMatchObject({ active: true, semitones: 2.15 });
    expect(sched.input).toBeCloseTo((sched.output as number) - start.ctxTime, 9);
  });

  it('keeps the pitch when the speed changes, and the reverse', async () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.play();
    await engine.setPitch(3);
    await engine.setPlaybackRate(0.5);
    expect(stretchNodes[0].schedules.at(-1)).toMatchObject({ rate: 0.5, semitones: 3 });

    // Back to 1x: still transposed, so still stretch voices
    const sources = ctx.startedSources().length;
    await engine.setPlaybackRate(1);
    expect(stretchNodes[0].schedules.at(-1)).toMatchObject({ active: true, rate: 1, semitones: 3 });
    expect(ctx.startedSources()).toHaveLength(sources);
  });

  it('carries the pitch across loop jumps', async () => {
    engine.addTrack('a', fakeBuffer(10));
    engine.setLoop({ start: 1, end: 2 });
    await engine.setPitch(-0.5);
    const start = engine.play();
    advanceTo(start.ctxTime + 1.95);
    const jump = stretchNodes[0].schedules.at(-1)!;
    expect(jump).toMatchObject({ active: true, input: 1, semitones: -0.5 });
  });

  it('goes back to plain buffer playback without shift', async () => {
    engine.addTrack('a', fakeBuffer(10));
    await engine.setPitch(1);
    const start = engine.play();
    expect(ctx.startedSources()).toHaveLength(0);

    ctx.currentTime = start.ctxTime + 1;
    await engine.setPitch(0);

    expect(engine.getPitch()).toBe(0);
    expect(stretchNodes[0].schedules.at(-1)!.active).toBe(false);
    expect(ctx.startedSources()[0].startArgs!.when).toBe(stretchNodes[0].schedules.at(-1)!.output);
  });

  it('applies only the latest of quick successive changes', async () => {
    engine.addTrack('a', fakeBuffer(10));
    const first = engine.setPitch(1);
    const second = engine.setPlaybackRate(0.8);
    await Promise.all([first, second]);
    expect(engine.getPitch()).toBe(1);
    expect(engine.getPlaybackRate()).toBe(0.8);
  });

  it('clamps the shift to an octave either way', async () => {
    engine.addTrack('a', fakeBuffer(10));
    await engine.setPitch(30);
    expect(engine.getPitch()).toBe(12);
  });
});

describe('AudioEngine level meters', () => {
  it('reads the peak of each channel of a track, after its gain', () => {
    engine.addTrack('stereo', fakeBuffer(10, 48000, 2));
    engine.addTrack('mono', fakeBuffer(10, 48000, 1));
    const [left, right, mono] = ctx.analysers;
    left.samples = [0.1, -0.5, 0.2];
    right.samples = [0.25];
    mono.samples = [-0.8];
    expect(engine.getTrackPeaks('stereo')).toEqual([0.5, 0.25]);
    // Mono file: one channel only
    expect(engine.getTrackPeaks('mono')).toEqual([expect.closeTo(0.8, 5)]);
    expect(engine.getTrackPeaks('missing')).toBeNull();
  });
});

describe('AudioEngine takes recorded on a transposed piece', () => {
  /** Lets the engine prepare its stretch nodes and switch voices */
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it('plays a take as recorded when the pitch has not changed since', async () => {
    engine.setTrackPitchOffset('take', 2);
    engine.addTrack('song', fakeBuffer(10));
    engine.addTrack('take', fakeBuffer(10));
    await engine.setPitch(2);
    engine.play();
    const [song, take] = stretchNodes.map((n) => n.schedules.at(-1)!);
    expect(song).toMatchObject({ active: true, semitones: 2 });
    expect(take).toMatchObject({ active: true, semitones: 0 });
  });

  it('shifts the take by the difference when the piece goes back to its original pitch', async () => {
    engine.setTrackPitchOffset('take', 2);
    engine.addTrack('song', fakeBuffer(10));
    engine.addTrack('take', fakeBuffer(10));
    // Pitch 0, but the take needs -2: stretch voices for every track, still in sync
    await settle();
    expect(stretchNodes).toHaveLength(2);
    const start = engine.play();
    expect(ctx.startedSources()).toHaveLength(0);
    const [song, take] = stretchNodes.map((n) => n.schedules.at(-1)!);
    expect(song).toMatchObject({ active: true, semitones: 0, output: start.ctxTime });
    expect(take).toMatchObject({ active: true, semitones: -2, output: start.ctxTime });
  });

  it('goes back to plain playback once no track is shifted', async () => {
    engine.setTrackPitchOffset('take', 2);
    engine.addTrack('take', fakeBuffer(10));
    await settle();
    engine.setTrackPitchOffset('take', 0);
    await settle();
    engine.play();
    expect(ctx.startedSources()).toHaveLength(1);
    expect(stretchNodes[0].schedules).toHaveLength(0);
  });

  it('retunes only the take when its own pitch changes while playing', async () => {
    engine.addTrack('song', fakeBuffer(10));
    engine.addTrack('take', fakeBuffer(10));
    await engine.setPitch(3);
    const start = engine.play();
    ctx.currentTime = start.ctxTime + 1;
    const songSchedules = stretchNodes[0].schedules.length;

    engine.setTrackPitchOffset('take', 3);

    expect(stretchNodes[0].schedules).toHaveLength(songSchedules);
    const take = stretchNodes[1].schedules.at(-1)!;
    expect(take).toMatchObject({ active: true, semitones: 0 });
    expect(take.input).toBeCloseTo((take.output as number) - start.ctxTime, 9);
  });
});
