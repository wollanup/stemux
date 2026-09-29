/**
 * Microphone capture on the SAME AudioContext as playback.
 *
 * An AudioWorklet copies the raw input samples and knows the exact AudioContext
 * frame of each of them (`currentFrame`). Recording therefore starts on the
 * exact frame where playback starts: no MediaRecorder start-up delay, no
 * guessing with getCurrentTime().
 */

import { logger } from '../utils/logger';

const PROCESSOR_NAME = 'stemux-capture';

/** Exported for tests */
export const WORKLET_SOURCE = `
class StemuxCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.startFrame = Infinity;
    this.stopFrame = Infinity;
    this.closed = false;
    this.chunk = new Float32Array(4096);
    this.chunkLength = 0;
    this.chunkFrame = 0;
    this.peak = 0;
    this.levelCounter = 0;
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'start') {
        this.startFrame = msg.frame;
        this.stopFrame = Infinity;
        this.chunkLength = 0;
      } else if (msg.type === 'stop') {
        this.stopFrame = msg.frame;
      } else if (msg.type === 'close') {
        this.closed = true;
      }
    };
  }

  flush() {
    if (this.chunkLength > 0) {
      this.port.postMessage({ type: 'data', frame: this.chunkFrame, samples: this.chunk.slice(0, this.chunkLength) });
      this.chunkLength = 0;
    }
  }

  process(inputs) {
    if (this.closed) return false;
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    const n = channel.length;
    const blockStart = currentFrame;

    // Input level meter (~every 50ms)
    for (let i = 0; i < n; i++) {
      const v = Math.abs(channel[i]);
      if (v > this.peak) this.peak = v;
    }
    this.levelCounter += n;
    if (this.levelCounter >= sampleRate * 0.05) {
      this.port.postMessage({ type: 'level', peak: this.peak });
      this.peak = 0;
      this.levelCounter = 0;
    }

    if (this.startFrame !== Infinity) {
      const from = Math.max(0, this.startFrame - blockStart);
      const to = Math.min(n, this.stopFrame - blockStart);
      for (let i = from; i < to; i++) {
        if (this.chunkLength === 0) this.chunkFrame = blockStart + i;
        this.chunk[this.chunkLength++] = channel[i];
        if (this.chunkLength === this.chunk.length) this.flush();
      }
      if (blockStart + n >= this.stopFrame) {
        this.flush();
        this.port.postMessage({ type: 'stopped', frame: this.stopFrame });
        this.startFrame = Infinity;
        this.stopFrame = Infinity;
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', StemuxCaptureProcessor);
`;

const modulePromises = new WeakMap<BaseAudioContext, Promise<void>>();

function ensureModule(ctx: AudioContext): Promise<void> {
  let promise = modulePromises.get(ctx);
  if (!promise) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
    promise = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    modulePromises.set(ctx, promise);
  }
  return promise;
}

export interface Take {
  /** AudioContext frame of samples[0] */
  startFrame: number;
  sampleRate: number;
  samples: Float32Array;
}

export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false, // critical for music
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
};

export class MicRecorder {
  private readonly ctx: AudioContext;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Array<{ frame: number; samples: Float32Array }> = [];
  private startFrame = 0;
  private stopFrame = Infinity;
  private stopResolver: ((take: Take) => void) | null = null;
  private levelListeners = new Set<(peak: number) => void>();
  private dataListeners = new Set<(frame: number, samples: Float32Array) => void>();
  private recording = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  isOpen() {
    return this.node !== null;
  }

  isRecording() {
    return this.recording;
  }

  async open(): Promise<void> {
    if (this.node) return;
    await ensureModule(this.ctx);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete', // keep input 1 only, no downmix
    });
    node.port.onmessage = (event) => this.handleMessage(event.data);
    this.source.connect(node);
    // Must reach the destination to be pulled by the renderer (outputs silence)
    node.connect(this.ctx.destination);
    this.node = node;

    const settings = stream.getAudioTracks()[0]?.getSettings();
    logger.log(`🎙️ Mic opened: ${settings?.sampleRate ?? '?'}Hz, ${settings?.channelCount ?? '?'}ch, ctx ${this.ctx.sampleRate}Hz`);
  }

  close() {
    this.node?.port.postMessage({ type: 'close' });
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.source = null;
    this.stream = null;
    this.recording = false;
  }

  /** Browser estimate of the input latency (converter + driver + browser), in seconds */
  getInputLatencyEstimate(): number {
    const settings = this.stream?.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
    return settings?.latency ?? 0;
  }

  /** Start capturing exactly at the given AudioContext time */
  start(ctxTime: number) {
    if (!this.node) throw new Error('Microphone not opened');
    this.chunks = [];
    this.startFrame = Math.round(ctxTime * this.ctx.sampleRate);
    this.stopFrame = Infinity;
    this.recording = true;
    this.node.port.postMessage({ type: 'start', frame: this.startFrame });
  }

  /** Stop capturing at the given AudioContext time, resolves with the take */
  stop(ctxTime: number): Promise<Take> {
    if (!this.node || !this.recording) {
      return Promise.resolve({ startFrame: this.startFrame, sampleRate: this.ctx.sampleRate, samples: new Float32Array(0) });
    }
    const stopFrame = Math.max(this.startFrame, Math.round(ctxTime * this.ctx.sampleRate));
    this.stopFrame = stopFrame;
    return new Promise((resolve) => {
      this.stopResolver = resolve;
      this.node!.port.postMessage({ type: 'stop', frame: stopFrame });
    });
  }

  onLevel(listener: (peak: number) => void): () => void {
    this.levelListeners.add(listener);
    return () => {
      this.levelListeners.delete(listener);
    };
  }

  onData(listener: (frame: number, samples: Float32Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  private handleMessage(msg: { type: string; frame?: number; samples?: Float32Array; peak?: number }) {
    if (msg.type === 'level') {
      this.levelListeners.forEach((l) => l(msg.peak ?? 0));
    } else if (msg.type === 'data' && msg.samples) {
      this.chunks.push({ frame: msg.frame!, samples: msg.samples });
      this.dataListeners.forEach((l) => l(msg.frame!, msg.samples!));
    } else if (msg.type === 'stopped') {
      this.recording = false;
      const take = this.assemble();
      this.stopResolver?.(take);
      this.stopResolver = null;
    }
  }

  private assemble(): Take {
    const first = this.chunks[0];
    if (!first) {
      return { startFrame: this.startFrame, sampleRate: this.ctx.sampleRate, samples: new Float32Array(0) };
    }
    // If the context started late, the first captured frame may be after startFrame:
    // place every chunk at its own frame so the timing stays exact.
    // The audio thread runs ahead of ctx.currentTime, so frames past the stop
    // frame may already have been captured: cut them.
    const last = this.chunks[this.chunks.length - 1];
    const end = Math.min(last.frame + last.samples.length, this.stopFrame);
    const samples = new Float32Array(Math.max(0, end - this.startFrame));
    for (const chunk of this.chunks) {
      const offset = chunk.frame - this.startFrame;
      if (offset >= 0 && offset < samples.length) {
        samples.set(chunk.samples.subarray(0, samples.length - offset), offset);
      }
    }
    this.chunks = [];
    if (first.frame !== this.startFrame) {
      logger.warn(`🎙️ First captured frame ${first.frame} != requested ${this.startFrame} (${first.frame - this.startFrame} frames)`);
    }
    return { startFrame: this.startFrame, sampleRate: this.ctx.sampleRate, samples };
  }
}
