import { describe, expect, it } from 'vitest';
import { buildTake, formatRecordingTime } from '../audioUtils';

/** Decodes the 16-bit PCM WAV produced by buildTake */
const parseWav = async (blob: Blob) => {
  const view = new DataView(await blob.arrayBuffer());
  const text = (offset: number) => String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(offset + i)));
  const channels = view.getUint16(22, true);
  const dataBytes = view.getUint32(40, true);
  const frames = dataBytes / (channels * 2);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = view.getInt16(44 + i * 4, true) / 0x7fff;
    right[i] = view.getInt16(46 + i * 4, true) / 0x7fff;
  }
  return {
    riff: text(0),
    wave: text(8),
    format: view.getUint16(20, true),
    channels,
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    frames,
    left,
    right,
  };
};

/** Silence with a single impulse */
const impulse = (length: number, at: number, value = 0.5) => {
  const samples = new Float32Array(length);
  samples[at] = value;
  return samples;
};

const peakIndex = (x: Float32Array) => x.reduce((best, v, i) => (Math.abs(v) > Math.abs(x[best]) ? i : best), 0);

describe('buildTake', () => {
  it('writes a valid stereo 16-bit PCM WAV', async () => {
    const wav = await parseWav(buildTake(impulse(100, 10), 44100, 0).blob);
    expect(wav).toMatchObject({ riff: 'RIFF', wave: 'WAVE', format: 1, channels: 2, sampleRate: 44100, bitsPerSample: 16, frames: 100 });
  });

  it('places the clip at its position in the piece, without adding silence', async () => {
    const take = buildTake(impulse(100, 10), 1000, 30);
    expect(take.clipOffset).toBe(30);
    const wav = await parseWav(take.blob);
    expect(wav.frames).toBe(100);
    expect(peakIndex(wav.left)).toBe(10);
  });

  it('trims the beginning when latency compensation goes before 0', async () => {
    const take = buildTake(impulse(100, 10), 1000, -0.004);
    expect(take.clipOffset).toBe(0);
    const wav = await parseWav(take.blob);
    expect(wav.frames).toBe(96);
    expect(peakIndex(wav.left)).toBe(6);
  });

  it('duplicates the mono take on both channels', async () => {
    const wav = await parseWav(buildTake(impulse(50, 7), 1000, 0).blob);
    expect(Array.from(wav.right)).toEqual(Array.from(wav.left));
  });

  it('normalizes a usable signal to 95% peak', async () => {
    const wav = await parseWav(buildTake(impulse(50, 7, -0.5), 1000, 0).blob);
    expect(wav.left[7]).toBeCloseTo(-0.95, 3);
  });

  it('does not boost a signal that is only noise', async () => {
    const wav = await parseWav(buildTake(impulse(50, 7, 0.01), 1000, 0).blob);
    expect(wav.left[7]).toBeCloseTo(0.01, 3);
  });

  it('does not modify the captured samples', () => {
    const samples = impulse(50, 7);
    buildTake(samples, 1000, -0.002);
    expect(samples[7]).toBe(0.5);
  });
});

describe('formatRecordingTime', () => {
  it('formats milliseconds as MM:SS', () => {
    expect(formatRecordingTime(0)).toBe('00:00');
    expect(formatRecordingTime(65_900)).toBe('01:05');
  });
});
