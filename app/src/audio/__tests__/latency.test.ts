import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from '../../test/fakeWebAudio';
import type { MicRecorder } from '../MicRecorder';

vi.stubGlobal('AudioContext', vi.fn(function () {
  return new FakeAudioContext(); // baseLatency 10ms + outputLatency 20ms
}));

const {
  detectRoundTripMs,
  estimateRoundTripLatency,
  getRecordingLatency,
  loadLatencyOverrideMs,
  saveLatencyOverrideMs,
} = await import('../latency');

const micWithInputLatency = (seconds: number) =>
  ({ getInputLatencyEstimate: () => seconds }) as unknown as MicRecorder;

describe('latency settings', () => {
  beforeEach(() => localStorage.clear());

  it('uses the browser estimate by default', () => {
    expect(loadLatencyOverrideMs()).toBeNull();
    expect(estimateRoundTripLatency()).toBeCloseTo(0.03, 9);
    expect(getRecordingLatency(micWithInputLatency(0.005))).toBeCloseTo(0.035, 9);
  });

  it('uses the manual or calibrated value when set', () => {
    saveLatencyOverrideMs(42.5);
    expect(loadLatencyOverrideMs()).toBe(42.5);
    expect(getRecordingLatency(micWithInputLatency(0.005))).toBeCloseTo(0.0425, 9);
  });

  it('goes back to auto when cleared', () => {
    saveLatencyOverrideMs(10);
    saveLatencyOverrideMs(null);
    expect(loadLatencyOverrideMs()).toBeNull();
  });

  it('ignores a corrupted stored value', () => {
    localStorage.setItem('recording-latency-ms', 'abc');
    expect(loadLatencyOverrideMs()).toBeNull();
  });
});

describe('detectRoundTripMs (calibration)', () => {
  const sr = 48000;
  let random: () => number;

  beforeEach(() => {
    // Deterministic noise
    let seed = 1;
    random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
  });

  afterEach(() => vi.restoreAllMocks());

  /** Recording of clicks delayed by `delayMs`, with background noise */
  const recording = (expectedFrames: number[], delayMs: number, { noise = 0.002, gain = 0.4, missing = [] as number[] } = {}) => {
    const x = new Float32Array(expectedFrames.at(-1)! + sr);
    for (let i = 0; i < x.length; i++) x[i] = random() * noise;
    expectedFrames.forEach((frame, k) => {
      if (missing.includes(k)) return;
      const start = frame + Math.round((delayMs / 1000) * sr);
      for (let i = 0; i < 200; i++) x[start + i] += Math.sin((2 * Math.PI * 2000 * i) / sr) * gain * (1 - i / 200);
    });
    return x;
  };

  const clicks = Array.from({ length: 6 }, (_, k) => Math.round((0.4 + k * 0.5) * sr));

  it('measures the delay of the recorded clicks', () => {
    expect(detectRoundTripMs(recording(clicks, 23.4), sr, clicks)).toBeCloseTo(23.4, 0);
  });

  it('works with a quiet click', () => {
    expect(detectRoundTripMs(recording(clicks, 87, { gain: 0.05 }), sr, clicks)).toBeCloseTo(87, 0);
  });

  it('tolerates a few missed clicks', () => {
    expect(detectRoundTripMs(recording(clicks, 12, { missing: [0, 3] }), sr, clicks)).toBeCloseTo(12, 0);
  });

  it('fails when the clicks are not heard', () => {
    expect(() => detectRoundTripMs(recording(clicks, 20, { gain: 0 }), sr, clicks)).toThrow('clicks-not-detected');
  });

  it('fails when the measurements disagree', () => {
    const x = new Float32Array(clicks.at(-1)! + sr);
    clicks.forEach((frame, k) => {
      const start = frame + Math.round(((10 + k * 15) / 1000) * sr);
      x[start] = 0.5;
    });
    expect(() => detectRoundTripMs(x, sr, clicks)).toThrow('inconsistent');
  });
});
