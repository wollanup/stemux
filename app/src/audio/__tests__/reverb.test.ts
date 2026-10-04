import { describe, expect, it } from 'vitest';
import { generateImpulseResponse, REVERB_DECAY } from '../reverb';

describe('reverb impulse response', () => {
  const sr = 48000;
  const [left, right] = generateImpulseResponse(sr);
  const rms = (data: Float32Array, from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / (to - from));
  };

  it('lasts the decay time plus the pre-delay', () => {
    expect(left.length / sr).toBeGreaterThan(REVERB_DECAY);
    expect(left.length / sr).toBeLessThan(REVERB_DECAY + 0.05);
    expect(left[0]).toBe(0);
  });

  it('fades out', () => {
    const early = rms(left, sr * 0.05, sr * 0.15);
    const late = rms(left, left.length - sr * 0.1, left.length);
    expect(20 * Math.log10(late / early)).toBeLessThan(-40);
  });

  it('is different on each side (wide stereo) and the same every time', () => {
    expect(left).not.toEqual(right);
    expect(generateImpulseResponse(sr)[0]).toEqual(left);
  });
});
