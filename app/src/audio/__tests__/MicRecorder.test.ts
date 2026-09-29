import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicRecorder, WORKLET_SOURCE } from '../MicRecorder';
import { FakeAudioContext } from '../../test/fakeWebAudio';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

type Message = { type: string; frame?: number; samples?: Float32Array; peak?: number };

interface Processor {
  port: { postMessage: (msg: Message) => void; onmessage: ((event: { data: unknown }) => void) | null };
  process(inputs: Float32Array[][]): boolean;
}

/** Evaluates the worklet source with fake AudioWorkletGlobalScope globals */
const loadProcessorClass = (): new () => Processor => {
  let registered: (new () => Processor) | null = null;
  class AudioWorkletProcessor {
    port = { postMessage: () => {}, onmessage: null };
  }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', WORKLET_SOURCE)(
    AudioWorkletProcessor,
    (_name: string, cls: new () => Processor) => {
      registered = cls;
    },
    SAMPLE_RATE
  );
  return registered!;
};

/** Block whose samples are their own absolute frame numbers */
const block = (start: number) => {
  const channel = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) channel[i] = start + i;
  return channel;
};

/** Runs the processor over [from, to) frames, like the audio thread would */
const render = (processor: Processor, from: number, to: number) => {
  for (let frame = from; frame < to; frame += BLOCK) {
    (globalThis as unknown as { currentFrame: number }).currentFrame = frame;
    processor.process([[block(frame)]]);
  }
};

const Processor = loadProcessorClass();

describe('capture worklet', () => {
  let processor: Processor;
  let messages: Message[];

  beforeEach(() => {
    processor = new Processor();
    messages = [];
    processor.port.postMessage = (msg) => messages.push(msg);
  });

  const captured = () => {
    const chunks = messages.filter((m) => m.type === 'data');
    const total = chunks.reduce((n, c) => n + c.samples!.length, 0);
    const all = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      all.set(c.samples!, offset);
      offset += c.samples!.length;
    }
    return { chunks, all };
  };

  it('captures exactly the frames between start and stop', () => {
    processor.port.onmessage!({ data: { type: 'start', frame: 1000 } });
    render(processor, 0, 1600);
    processor.port.onmessage!({ data: { type: 'stop', frame: 10050 } });
    render(processor, 1664, 10240);

    const { chunks, all } = captured();
    expect(chunks[0].frame).toBe(1000);
    expect(all).toHaveLength(10050 - 1000);
    expect(all[0]).toBe(1000);
    expect(all.at(-1)).toBe(10049);
    // No sample lost or duplicated
    for (let i = 1; i < all.length; i++) expect(all[i] - all[i - 1]).toBe(1);

    expect(messages.filter((m) => m.type === 'stopped')).toEqual([{ type: 'stopped', frame: 10050 }]);
  });

  it('captures nothing before start', () => {
    render(processor, 0, 4096);
    expect(captured().chunks).toHaveLength(0);
    expect(messages.some((m) => m.type === 'level')).toBe(true);
  });

  it('stops right away when the stop frame is already past', () => {
    processor.port.onmessage!({ data: { type: 'start', frame: 256 } });
    render(processor, 256, 512);
    // The main thread asks to stop at a frame the audio thread already rendered
    processor.port.onmessage!({ data: { type: 'stop', frame: 300 } });
    render(processor, 512, 1024);

    // Already captured frames are sent (the recorder trims them), nothing after
    const { all } = captured();
    expect(all.at(-1)).toBe(511);
    expect(messages.filter((m) => m.type === 'stopped')).toHaveLength(1);
  });

  it('reports the input peak level', () => {
    const loud = new Float32Array(BLOCK).fill(0.5);
    loud[10] = -0.8;
    for (let i = 0; i < 20; i++) {
      (globalThis as unknown as { currentFrame: number }).currentFrame = i * BLOCK;
      processor.process([[loud]]);
    }
    const level = messages.find((m) => m.type === 'level');
    expect(level?.peak).toBeCloseTo(0.8, 6);
  });
});

describe('MicRecorder', () => {
  let ctx: FakeAudioContext;
  let processor: Processor;

  beforeEach(() => {
    ctx = new FakeAudioContext({ sampleRate: SAMPLE_RATE });

    // AudioWorkletNode wired to a real processor instance through fake ports
    class FakeWorkletNode {
      port: { postMessage: (msg: unknown) => void; onmessage: ((event: { data: unknown }) => void) | null };
      constructor() {
        processor = new Processor();
        const nodePort = {
          onmessage: null as ((event: { data: unknown }) => void) | null,
          postMessage: (msg: unknown) => processor.port.onmessage!({ data: msg }),
        };
        processor.port.postMessage = (msg) => nodePort.onmessage?.({ data: msg });
        this.port = nodePort;
      }
      connect() {}
      disconnect() {}
    }
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);

    const track = { getSettings: () => ({ latency: 0.004, sampleRate: SAMPLE_RATE, channelCount: 1 }), stop: vi.fn() };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track], getTracks: () => [track] })),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const open = async () => {
    const recorder = new MicRecorder(ctx as unknown as AudioContext);
    await recorder.open();
    return recorder;
  };

  it('returns a take starting on the requested AudioContext frame', async () => {
    const recorder = await open();
    expect(recorder.isOpen()).toBe(true);

    recorder.start(1000 / SAMPLE_RATE);
    expect(recorder.isRecording()).toBe(true);
    render(processor, 0, 5000);
    const takePromise = recorder.stop(4000 / SAMPLE_RATE);
    render(processor, 5000, 5120);
    const take = await takePromise;

    expect(take.startFrame).toBe(1000);
    expect(take.sampleRate).toBe(SAMPLE_RATE);
    expect(take.samples).toHaveLength(3000);
    expect(take.samples[0]).toBe(1000);
    expect(take.samples[2999]).toBe(3999);
    expect(recorder.isRecording()).toBe(false);
  });

  it('trims frames captured past the stop frame', async () => {
    const recorder = await open();
    recorder.start(0);
    // The audio thread is ahead of the main thread clock
    render(processor, 0, 8192);
    const takePromise = recorder.stop(5000 / SAMPLE_RATE);
    render(processor, 8192, 8320);
    const take = await takePromise;

    expect(take.samples).toHaveLength(5000);
    expect(take.samples[4999]).toBe(4999);
  });

  it('keeps timing exact when capture begins after the start frame', async () => {
    const recorder = await open();
    recorder.start(1000 / SAMPLE_RATE);
    // The audio thread only delivers input from frame 1152
    render(processor, 1152, 2048);
    const takePromise = recorder.stop(2000 / SAMPLE_RATE);
    render(processor, 2048, 2176);
    const take = await takePromise;

    expect(take.samples).toHaveLength(1000);
    expect(take.samples[151]).toBe(0);
    expect(take.samples[152]).toBe(1152);
  });

  it('exposes the browser input latency estimate', async () => {
    const recorder = await open();
    expect(recorder.getInputLatencyEstimate()).toBe(0.004);
  });

  it('releases the microphone on close', async () => {
    const recorder = await open();
    const stream = await (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.results[0].value;
    recorder.close();
    expect(recorder.isOpen()).toBe(false);
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('asks for a raw signal (no echo cancellation, AGC or noise suppression)', async () => {
    await open();
    const constraints = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(constraints.audio).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
});
