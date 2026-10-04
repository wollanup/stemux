import { describe, expect, it } from 'vitest';
import { detectTempo, type DetectSource } from '../detectTempo';

const SR = 22050;

/** Decaying tone bursts on every beat, the first beat of each bar louder */
function drums(seconds: number, bpm: number, start: number, options: { accent?: number; offbeats?: boolean; seed?: number } = {}): Float32Array<ArrayBuffer> {
  const data = new Float32Array(Math.round(seconds * SR));
  const beat = 60 / bpm;
  let random = options.seed ?? 1;
  const noise = () => ((random = (random * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const hit = (time: number, gain: number, freq: number, decay: number) => {
    const from = Math.round(time * SR);
    for (let i = 0; i < SR * 0.2 && from + i < data.length; i++) {
      if (from + i < 0) continue;
      const t = i / SR;
      data[from + i] += gain * Math.exp(-t * decay) * (freq > 0 ? Math.sin(2 * Math.PI * freq * t) : noise());
    }
  };
  for (let k = 0; start + k * beat < seconds; k++) {
    hit(start + k * beat, k % 4 === 0 ? (options.accent ?? 0.9) : 0.5, 60, 25);
    if (options.offbeats) hit(start + (k + 0.5) * beat, 0.25, 0, 60);
  }
  // Background noise
  for (let i = 0; i < data.length; i++) data[i] += noise() * 0.01;
  return data;
}

const source = (data: Float32Array<ArrayBuffer>, offset = 0): DetectSource => ({
  buffer: { sampleRate: SR, numberOfChannels: 1, duration: data.length / SR, getChannelData: () => data },
  offset,
  trimStart: 0,
  duration: data.length / SR,
});

/** Distance between two times modulo a period */
const phaseError = (a: number, b: number, period: number) => {
  const d = (((a - b) % period) + period) % period;
  return Math.min(d, period - d);
};

describe('tempo detection', () => {
  it('finds a whole tempo, its beats and bar 1', () => {
    const result = detectTempo([source(drums(30, 128, 0.37))])!;
    expect(result.bpm).toBe(128);
    // Bar 1 on an accented beat: a multiple of 4 beats after 0.37s
    expect(phaseError(result.offset, 0.37, (4 * 60) / 128)).toBeLessThan(0.02);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('is not fooled by off-beat hi-hats', () => {
    const result = detectTempo([source(drums(30, 96, 0.8, { offbeats: true }))])!;
    expect(result.bpm).toBe(96);
    expect(phaseError(result.offset, 0.8, 60 / 96)).toBeLessThan(0.02);
  });

  it('keeps a tempo that is not whole', () => {
    const result = detectTempo([source(drums(40, 97.5, 0.1))])!;
    expect(result.bpm).toBeCloseTo(97.5, 0);
  });

  it('places the tracks where their clips are', () => {
    // The file starts with its first beat, the clip is placed at 2.25s
    const result = detectTempo([source(drums(30, 110, 0), 2.25)])!;
    expect(result.bpm).toBe(110);
    expect(phaseError(result.offset, 2.25, (4 * 60) / 110)).toBeLessThan(0.02);
  });

  it('gives up on silence', () => {
    expect(detectTempo([source(new Float32Array(SR * 10))])).toBeNull();
  });
});
