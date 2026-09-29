/**
 * Recording latency compensation
 *
 * When you play along, what you hear is late by the OUTPUT latency, and what the
 * mic captures reaches the browser late by the INPUT latency. A take is therefore
 * late by the round trip (output + input) and must be shifted earlier by it.
 *
 * Browsers only give rough estimates (and no ASIO), so the round trip can be
 * measured with a loopback calibration, or set manually.
 */

import { audioEngine } from './AudioEngine';
import { MicRecorder } from './MicRecorder';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'recording-latency-ms';

/** Manual/calibrated round-trip latency in ms, or null for the browser estimate */
export const loadLatencyOverrideMs = (): number | null => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) return null;
  const value = parseFloat(stored);
  return Number.isFinite(value) ? value : null;
};

export const saveLatencyOverrideMs = (value: number | null) => {
  if (value === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, String(value));
};

/** Browser estimate of the round trip, in seconds */
export const estimateRoundTripLatency = (recorder?: MicRecorder | null): number => {
  const ctx = audioEngine.getContext();
  const output = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
  const input = recorder?.getInputLatencyEstimate() ?? 0;
  return output + input;
};

/** Latency (seconds) to remove from a take */
export const getRecordingLatency = (recorder?: MicRecorder | null): number => {
  const override = loadLatencyOverrideMs();
  return override !== null ? override / 1000 : estimateRoundTripLatency(recorder);
};

const CLICK_COUNT = 6;
const CLICK_INTERVAL = 0.5;
const SEARCH_WINDOW = 0.5;

function createClick(ctx: AudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * 0.004);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Short 2kHz burst with a sharp attack: easy to detect
    data[i] = Math.sin((2 * Math.PI * 2000 * i) / ctx.sampleRate) * (1 - i / length) * 0.8;
  }
  return buffer;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Plays a few clicks and records them back (mic in front of the headphones or
 * speakers, or a cable from an output to an input of the sound card).
 * Returns the measured round-trip latency in ms.
 */
export async function calibrateRoundTripLatency(): Promise<number> {
  if (audioEngine.isPlaying()) audioEngine.pause();
  const ctx = audioEngine.getContext();
  await audioEngine.resume();

  const recorder = new MicRecorder(ctx);
  await recorder.open();
  try {
    const click = createClick(ctx);
    const sr = ctx.sampleRate;
    const start = ctx.currentTime + 0.3;
    const firstClick = start + 0.4;

    recorder.start(start);
    const clickTimes: number[] = [];
    for (let i = 0; i < CLICK_COUNT; i++) {
      const when = firstClick + i * CLICK_INTERVAL;
      const source = ctx.createBufferSource();
      source.buffer = click;
      source.connect(ctx.destination);
      source.start(when);
      clickTimes.push(when);
    }
    const end = firstClick + CLICK_COUNT * CLICK_INTERVAL + SEARCH_WINDOW;
    await new Promise((r) => window.setTimeout(r, (end - ctx.currentTime) * 1000 + 50));
    const take = await recorder.stop(ctx.currentTime);
    const x = take.samples;

    const delays: number[] = [];
    for (const when of clickTimes) {
      const expected = Math.round((when - start) * sr);
      // Noise floor just before the click
      const noiseFrom = Math.max(0, expected - Math.round(0.15 * sr));
      let noise = 0;
      for (let i = noiseFrom; i < expected && i < x.length; i++) noise = Math.max(noise, Math.abs(x[i]));

      const windowEnd = Math.min(x.length, expected + Math.round(SEARCH_WINDOW * sr));
      let peak = 0;
      for (let i = expected; i < windowEnd; i++) peak = Math.max(peak, Math.abs(x[i]));
      if (peak < 0.01 || peak < noise * 3) continue; // click not heard

      const threshold = Math.max(noise * 2, peak * 0.3);
      for (let i = expected; i < windowEnd; i++) {
        if (Math.abs(x[i]) >= threshold) {
          delays.push((i - expected) / sr);
          break;
        }
      }
    }

    logger.log(`⏱️ Calibration delays (ms): ${delays.map((d) => (d * 1000).toFixed(1)).join(', ')}`);
    if (delays.length < 3) {
      throw new Error('clicks-not-detected');
    }
    const m = median(delays);
    const consistent = delays.filter((d) => Math.abs(d - m) < 0.003);
    if (consistent.length < 3) {
      throw new Error('inconsistent');
    }
    return Math.round(median(consistent) * 10000) / 10;
  } finally {
    recorder.close();
  }
}
