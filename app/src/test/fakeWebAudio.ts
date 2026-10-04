/**
 * Minimal Web Audio fakes for unit tests (Node has no AudioContext).
 * The clock is manual: set `ctx.currentTime` to move time forward.
 */

export class FakeParam {
  value: number;
  constructor(value = 1) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
}

export class FakeNode {
  connections = new Set<unknown>();
  connect<T>(node: T): T {
    this.connections.add(node);
    return node;
  }
  disconnect() {
    this.connections.clear();
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  /** Samples returned by getFloatTimeDomainData */
  samples: number[] = [];
  getFloatTimeDomainData(data: Float32Array) {
    data.fill(0);
    data.set(this.samples.slice(0, data.length));
  }
}

export class FakeBufferSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  startArgs: { when: number; offset: number } | null = null;
  /** Third argument of start(): how long to play */
  duration: number | undefined;
  stopTime: number | null = null;
  start(when = 0, offset = 0, duration?: number) {
    this.startArgs = { when, offset };
    this.duration = duration;
  }
  stop(when = 0) {
    this.stopTime = when;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate: number;
  state: AudioContextState = 'running';
  baseLatency = 0.01;
  outputLatency = 0.02;
  destination = new FakeNode();
  sources: FakeBufferSource[] = [];
  audioWorklet = { addModule: () => Promise.resolve() };

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48000;
  }

  createGain() {
    return new FakeGain();
  }

  analysers: FakeAnalyser[] = [];

  createAnalyser() {
    const analyser = new FakeAnalyser();
    this.analysers.push(analyser);
    return analyser;
  }

  createChannelSplitter() {
    return new FakeNode();
  }

  createBufferSource() {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createMediaStreamSource() {
    return new FakeNode();
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  /** Sources whose playback was started (optionally only those not stopped before `at`) */
  startedSources() {
    return this.sources.filter((s) => s.startArgs !== null);
  }
}

export const fakeBuffer = (duration: number, sampleRate = 48000, channels = 1): AudioBuffer => {
  const length = Math.round(duration * sampleRate);
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    duration,
    sampleRate,
    length,
    numberOfChannels: channels,
    getChannelData: (c: number) => data[c],
  } as unknown as AudioBuffer;
};

/** Fake Signalsmith Stretch node recording its scheduled changes */
export class FakeStretchNode extends FakeNode {
  schedules: Array<Record<string, unknown>> = [];
  buffers: Float32Array[][] = [];
  schedule(change: Record<string, unknown>) {
    this.schedules.push(change);
    return Promise.resolve(change);
  }
  addBuffers(buffers: Float32Array[]) {
    this.buffers.push(buffers);
    return Promise.resolve(0);
  }
  dropBuffers() {
    return Promise.resolve();
  }
  stop() {
    return Promise.resolve();
  }
}
