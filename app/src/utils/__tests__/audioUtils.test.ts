import { describe, expect, it } from 'vitest';
import { buildTakeWav, computeDisplayPeaks, formatRecordingTime } from '../audioUtils';
import { fakeBuffer } from '../../test/fakeWebAudio';

/** Decodes the 16-bit PCM WAV produced by buildTakeWav */
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

describe('buildTakeWav', () => {
  it('writes a valid stereo 16-bit PCM WAV', async () => {
    const wav = await parseWav(buildTakeWav(impulse(100, 10), 44100, 0));
    expect(wav).toMatchObject({ riff: 'RIFF', wave: 'WAVE', format: 1, channels: 2, sampleRate: 44100, bitsPerSample: 16, frames: 100 });
  });

  it('pads with silence to place the take at its position in the piece', async () => {
    const sr = 1000;
    const wav = await parseWav(buildTakeWav(impulse(100, 10), sr, 0.5));
    expect(wav.frames).toBe(500 + 100);
    expect(peakIndex(wav.left)).toBe(510);
    expect(wav.left.subarray(0, 500).every((v) => v === 0)).toBe(true);
  });

  it('trims the beginning when latency compensation goes before 0', async () => {
    const sr = 1000;
    const wav = await parseWav(buildTakeWav(impulse(100, 10), sr, -0.004));
    expect(wav.frames).toBe(96);
    expect(peakIndex(wav.left)).toBe(6);
  });

  it('duplicates the mono take on both channels', async () => {
    const wav = await parseWav(buildTakeWav(impulse(50, 7), 1000, 0));
    expect(Array.from(wav.right)).toEqual(Array.from(wav.left));
  });

  it('normalizes a usable signal to 95% peak', async () => {
    const wav = await parseWav(buildTakeWav(impulse(50, 7, -0.5), 1000, 0));
    expect(wav.left[7]).toBeCloseTo(-0.95, 3);
  });

  it('does not boost a signal that is only noise', async () => {
    const wav = await parseWav(buildTakeWav(impulse(50, 7, 0.01), 1000, 0));
    expect(wav.left[7]).toBeCloseTo(0.01, 3);
  });

  it('does not modify the captured samples', () => {
    const samples = impulse(50, 7);
    buildTakeWav(samples, 1000, -0.002);
    expect(samples[7]).toBe(0.5);
  });
});

describe('computeDisplayPeaks', () => {
  it('keeps the largest sample of each block, with its sign', () => {
    const buffer = fakeBuffer(2, 3);
    buffer.getChannelData(0).set([0.1, -0.9, 0.2, 0.3, 0.1, -0.2]);
    const [peaks] = computeDisplayPeaks(buffer, 1);
    expect(Array.from(peaks)).toEqual([Float32Array.of(-0.9)[0], Float32Array.of(0.3)[0]]);
  });

  it('returns new arrays (WaveSurfer may normalize them in place)', () => {
    const buffer = fakeBuffer(1, 8, 2);
    const peaks = computeDisplayPeaks(buffer, 8);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).not.toBe(buffer.getChannelData(0));
  });

  it('draws at most two channels', () => {
    expect(computeDisplayPeaks(fakeBuffer(1, 8, 6), 8)).toHaveLength(2);
  });
});

describe('formatRecordingTime', () => {
  it('formats milliseconds as MM:SS', () => {
    expect(formatRecordingTime(0)).toBe('00:00');
    expect(formatRecordingTime(65_900)).toBe('01:05');
  });
});
