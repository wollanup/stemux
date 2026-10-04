/**
 * Automatic tempo detection, for music with a steady tempo.
 *
 * 1. Onset strength: how much the energy rises, 100 times per second, for
 *    every track (placed where its clip is), added up.
 * 2. Tempo: autocorrelation of the onsets, with a preference for usual
 *    tempos (around 120 BPM), then a fine search of the tempo and of the
 *    beat phase that best line up with the onsets.
 * 3. Bar 1: the beat of the bar where the onsets are strongest.
 *
 * It is a proposal: the user can correct it (tap, typing, "bar 1 here").
 */

import type { Tempo } from '../types/audio';
import { MAX_BPM, MIN_BPM } from './tempo';

/** Onset frames per second */
export const FPS = 100;
const MIN_DETECT_BPM = 50;
const MAX_DETECT_BPM = 220;

export interface DetectSource {
  buffer: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'getChannelData' | 'duration'>;
  /** Clip window: where the file is placed and which part is played (seconds) */
  offset: number;
  trimStart: number;
  duration: number;
}

export interface DetectedTempo extends Pick<Tempo, 'bpm' | 'offset'> {
  /** How clearly the beats stand out (0: not at all, 1+: clearly) */
  confidence: number;
}

const envelopeCache = new WeakMap<object, Float32Array>();

/**
 * Onset strength of a file, FPS frames per second: rise of the log energy,
 * of the signal and of its derivative (which brings out the attacks).
 */
export function onsetEnvelope(buffer: DetectSource['buffer']): Float32Array {
  const cached = envelopeCache.get(buffer);
  if (cached) return cached;
  // Exactly FPS frames per second (a rounded hop would bias the tempo)
  const hop = buffer.sampleRate / FPS;
  const frames = Math.floor(buffer.getChannelData(0).length / hop);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const onsets = new Float32Array(frames);
  let previous = 0;
  let previousDiff = 0;
  let last = 0;
  for (let f = 0; f < frames; f++) {
    let energy = 0;
    let diffEnergy = 0;
    const start = Math.round(f * hop);
    const end = Math.round((f + 1) * hop);
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (const data of channels) sample += data[i];
      const diff = sample - last;
      last = sample;
      energy += sample * sample;
      diffEnergy += diff * diff;
    }
    const level = Math.log1p((100 * energy) / (end - start));
    const diffLevel = Math.log1p((100 * diffEnergy) / (end - start));
    onsets[f] = Math.max(0, level - previous) + 0.5 * Math.max(0, diffLevel - previousDiff);
    previous = level;
    previousDiff = diffLevel;
  }
  envelopeCache.set(buffer, onsets);
  return onsets;
}

/** Onsets of all the clips on one timeline, each track weighing the same */
export function mixOnsets(sources: DetectSource[]): Float32Array {
  const end = Math.max(0, ...sources.map((s) => s.offset + s.duration));
  const mix = new Float32Array(Math.ceil(end * FPS) + 1);
  for (const source of sources) {
    const env = onsetEnvelope(source.buffer);
    const from = Math.floor(source.trimStart * FPS);
    const to = Math.min(env.length, Math.floor((source.trimStart + source.duration) * FPS));
    let sum = 0;
    for (let i = from; i < to; i++) sum += env[i];
    const mean = sum / Math.max(1, to - from);
    if (mean <= 0) continue;
    const shift = Math.round(source.offset * FPS) - from;
    for (let i = from; i < to; i++) {
      const j = i + shift;
      if (j >= 0 && j < mix.length) mix[j] += env[i] / mean;
    }
  }
  return mix;
}

/** Onset strength at a fractional frame */
const at = (onsets: Float32Array, frame: number) => {
  const i = Math.floor(frame);
  if (i < 0 || i + 1 >= onsets.length) return 0;
  const t = frame - i;
  return onsets[i] * (1 - t) + onsets[i + 1] * t;
};

/** Mean onset strength on a grid of beats (period and phase in frames) */
function combScore(onsets: Float32Array, period: number, phase: number): number {
  let sum = 0;
  let count = 0;
  for (let frame = phase; frame < onsets.length; frame += period) {
    sum += Math.max(at(onsets, frame - 1) * 0.5, at(onsets, frame), at(onsets, frame + 1) * 0.5);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** Best phase (frames) of a beat grid */
function bestPhase(onsets: Float32Array, period: number): { phase: number; score: number } {
  let best = { phase: 0, score: -Infinity };
  for (let phase = 0; phase < period; phase += 0.5) {
    const score = combScore(onsets, period, phase);
    if (score > best.score) best = { phase, score };
  }
  return best;
}

/** Coarse tempo: autocorrelation of the onsets, weighted towards usual tempos */
function coarseBpm(onsets: Float32Array): number | null {
  let mean = 0;
  for (const v of onsets) mean += v;
  mean /= onsets.length;
  const centered = onsets.map((v) => v - mean);
  const minLag = Math.floor((60 * FPS) / MAX_DETECT_BPM);
  const maxLag = Math.ceil((60 * FPS) / MIN_DETECT_BPM);
  const acf = new Float32Array(maxLag * 2 + 2);
  for (let lag = minLag; lag < acf.length && lag < centered.length; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < centered.length; i++) sum += centered[i] * centered[i + lag];
    acf[lag] = sum / (centered.length - lag);
  }
  let best: { lag: number; score: number } | null = null;
  for (let lag = minLag; lag <= maxLag; lag++) {
    // The beat period also shows at twice its lag
    const score = acf[lag] + 0.5 * acf[Math.min(acf.length - 1, lag * 2)];
    const bpm = (60 * FPS) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const weighted = score * prior;
    if (!best || weighted > best.score) best = { lag, score: weighted };
  }
  if (!best || best.score <= 0) return null;
  // Parabolic refinement around the peak
  const [a, b, c] = [acf[best.lag - 1], acf[best.lag], acf[best.lag + 1]];
  const denominator = a - 2 * b + c;
  const lag = denominator < 0 ? best.lag + (0.5 * (a - c)) / denominator : best.lag;
  return (60 * FPS) / lag;
}

/**
 * Tempo, beat phase and bar 1 of the sources. Null when nothing rhythmic
 * was found (silence, too short).
 */
export function detectTempo(sources: DetectSource[], beatsPerBar = 4): DetectedTempo | null {
  const onsets = mixOnsets(sources);
  if (onsets.length < FPS * 4) return null;
  const coarse = coarseBpm(onsets);
  if (!coarse) return null;

  // Fine search around the coarse tempo, phase included
  let best = { bpm: coarse, phase: 0, score: -Infinity };
  for (let bpm = coarse * 0.97; bpm <= coarse * 1.03; bpm += 0.02) {
    const { phase, score } = bestPhase(onsets, (60 * FPS) / bpm);
    if (score > best.score) best = { bpm, phase, score };
  }
  // Fast tempo whose beats alternate strong / weak: the weak ones are
  // subdivisions (off-beat hi-hats), the real beat is half as fast
  if (best.bpm > 150) {
    const half = (2 * 60 * FPS) / best.bpm;
    const a = combScore(onsets, half, best.phase);
    const b = combScore(onsets, half, best.phase + half / 2);
    if (Math.max(a, b) > 1.5 * Math.min(a, b)) {
      best = { bpm: best.bpm / 2, phase: a >= b ? best.phase : best.phase + half / 2, score: Math.max(a, b) };
    }
  }

  // Most music is made at a whole tempo
  const rounded = Math.round(best.bpm);
  if (Math.abs(best.bpm - rounded) < 0.15) best = { bpm: rounded, ...bestPhase(onsets, (60 * FPS) / rounded) };

  // Bar 1: the beat of the bar with the strongest onsets
  const period = (60 * FPS) / best.bpm;
  const strength = new Array<number>(beatsPerBar).fill(0);
  for (let beat = 0, frame = best.phase; frame < onsets.length; beat++, frame += period) {
    strength[beat % beatsPerBar] += at(onsets, frame);
  }
  const downbeat = strength.indexOf(Math.max(...strength));
  const offset = (best.phase + downbeat * period) / FPS;

  let mean = 0;
  for (const v of onsets) mean += v;
  mean /= onsets.length;
  const confidence = mean > 0 ? best.score / mean - 1 : 0;

  return { bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(best.bpm * 100) / 100)), offset, confidence };
}
