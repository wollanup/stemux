declare module 'signalsmith-stretch' {
  export interface StretchSchedule {
    /** AudioContext time at which this change applies */
    output?: number;
    active?: boolean;
    /** Position (seconds) in the input buffer */
    input?: number;
    rate?: number;
    semitones?: number;
    loopStart?: number;
    loopEnd?: number;
  }

  export interface StretchNode extends AudioWorkletNode {
    inputTime: number;
    schedule(change: StretchSchedule): Promise<unknown>;
    start(when?: number): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<unknown>;
    latency(): Promise<number>;
  }

  export default function SignalsmithStretch(
    audioContext: BaseAudioContext,
    options?: AudioWorkletNodeOptions
  ): Promise<StretchNode>;
}
