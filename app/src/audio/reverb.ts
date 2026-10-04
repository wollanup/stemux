/**
 * Reverb impulse response, generated (no file to download): decaying stereo
 * noise, darker as it fades, like a room whose walls absorb the highs first.
 * Left and right are different noise, so the tail is wide.
 */

/** Seconds for the tail to fade by 60 dB */
export const REVERB_DECAY = 2.2;
/** Seconds before the first reflections */
const PRE_DELAY = 0.012;
/** Seconds of fade-in of the reflections (no click at the start) */
const ATTACK = 0.004;

/** Small deterministic PRNG: the reverb sounds the same every time */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function generateImpulseResponse(sampleRate: number, decay = REVERB_DECAY): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.round((PRE_DELAY + decay) * sampleRate);
  const preDelay = Math.round(PRE_DELAY * sampleRate);
  return [1, 2].map((seed) => {
    const random = mulberry32(seed);
    const data = new Float32Array(length);
    let low = 0;
    for (let i = preDelay; i < length; i++) {
      const t = (i - preDelay) / sampleRate;
      const envelope = Math.min(1, t / ATTACK) * Math.pow(10, (-3 * t) / decay);
      // One-pole low-pass closing over time: bright at first, dull at the end
      const brightness = 0.9 - 0.75 * Math.min(1, t / decay);
      low += brightness * (random() * 2 - 1 - low);
      data[i] = low * envelope;
    }
    return data;
  }) as [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
}
