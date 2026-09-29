/**
 * Waveform peaks for drawing at any zoom level.
 *
 * A pyramid of min/max buckets is built once per clip; drawing a range asks
 * for exactly one min/max pair per screen column, reading the coarsest level
 * that is still finer than a column (or the raw samples when zoomed in a lot).
 */

export interface PeakColumns {
  min: Float32Array;
  max: Float32Array;
}

/** Anything the waveform canvas can draw */
export interface PeakSource {
  readonly sampleRate: number;
  /** Number of samples available */
  readonly length: number;
  /** Largest absolute sample, for display normalization */
  readonly absMax: number;
  /** One min/max per column over [t0, t1) seconds (NaN where there is no audio) */
  columns(t0: number, t1: number, count: number): PeakColumns;
}

interface Level {
  bucket: number;
  min: Float32Array;
  max: Float32Array;
}

const BASE_BUCKET = 256;

/** Reads min/max over sample range [s0, s1) of a level (or raw data) */
const reduceRange = (min: Float32Array, max: Float32Array, i0: number, i1: number): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = i0; i < i1; i++) {
    if (min[i] < lo) lo = min[i];
    if (max[i] > hi) hi = max[i];
  }
  return [lo, hi];
};

/** Min/max over raw samples [s0, s1) of every channel */
const reduceRaw = (channels: Float32Array[], s0: number, s1: number): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const ch of channels) {
    const [l, h] = reduceRange(ch, ch, s0, s1);
    if (l < lo) lo = l;
    if (h > hi) hi = h;
  }
  return [lo, hi];
};

const fillColumns = (
  source: { sampleRate: number; length: number },
  levels: Level[],
  raw: Float32Array[] | null,
  t0: number,
  t1: number,
  count: number
): PeakColumns => {
  const min = new Float32Array(count).fill(NaN);
  const max = new Float32Array(count).fill(NaN);
  if (count <= 0 || t1 <= t0) return { min, max };

  const samplesPerColumn = ((t1 - t0) * source.sampleRate) / count;
  // Coarsest level still finer than a column
  let level: Level | null = null;
  for (const l of levels) {
    if (l.bucket <= samplesPerColumn) level = l;
  }

  for (let c = 0; c < count; c++) {
    const s0 = Math.max(0, Math.floor(t0 * source.sampleRate + c * samplesPerColumn));
    const s1 = Math.min(source.length, Math.floor(t0 * source.sampleRate + (c + 1) * samplesPerColumn));
    if (s1 <= s0) {
      // Zoomed in beyond one sample per column: show the sample under the column
      if (s0 < source.length && raw) {
        [min[c], max[c]] = reduceRaw(raw, s0, s0 + 1);
      }
      continue;
    }
    let lo: number;
    let hi: number;
    if (level) {
      const i0 = Math.floor(s0 / level.bucket);
      const i1 = Math.min(level.min.length, Math.max(i0 + 1, Math.ceil(s1 / level.bucket)));
      [lo, hi] = reduceRange(level.min, level.max, i0, i1);
    } else if (raw) {
      [lo, hi] = reduceRaw(raw, s0, s1);
    } else {
      const base = levels[0];
      const i0 = Math.floor(s0 / base.bucket);
      [lo, hi] = reduceRange(base.min, base.max, i0, Math.min(base.min.length, i0 + 1));
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
};

export class PeakPyramid implements PeakSource {
  readonly sampleRate: number;
  readonly length: number;
  readonly absMax: number;
  /** References to the decoded channels (no copy) */
  private readonly raw: Float32Array[];
  private readonly levels: Level[] = [];

  constructor(channels: Float32Array[], sampleRate: number) {
    this.sampleRate = sampleRate;
    this.raw = channels.slice(0, 2);
    this.length = this.raw[0]?.length ?? 0;

    // Level 0 from the samples
    const count0 = Math.ceil(this.length / BASE_BUCKET);
    const min0 = new Float32Array(count0);
    const max0 = new Float32Array(count0);
    let absMax = 0;
    for (let b = 0; b < count0; b++) {
      const [lo, hi] = reduceRaw(this.raw, b * BASE_BUCKET, Math.min(this.length, (b + 1) * BASE_BUCKET));
      min0[b] = lo;
      max0[b] = hi;
      absMax = Math.max(absMax, Math.abs(lo), Math.abs(hi));
    }
    this.absMax = absMax;
    this.levels.push({ bucket: BASE_BUCKET, min: min0, max: max0 });

    // Each next level merges pairs of buckets
    while (this.levels[this.levels.length - 1].min.length > 64) {
      const prev = this.levels[this.levels.length - 1];
      const count = Math.ceil(prev.min.length / 2);
      const min = new Float32Array(count);
      const max = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const j = i * 2;
        const k = Math.min(j + 1, prev.min.length - 1);
        min[i] = Math.min(prev.min[j], prev.min[k]);
        max[i] = Math.max(prev.max[j], prev.max[k]);
      }
      this.levels.push({ bucket: prev.bucket * 2, min, max });
    }
  }

  static fromAudioBuffer(buffer: AudioBuffer): PeakPyramid {
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c));
    return new PeakPyramid(channels, buffer.sampleRate);
  }

  get duration() {
    return this.length / this.sampleRate;
  }

  columns(t0: number, t1: number, count: number): PeakColumns {
    return fillColumns(this, this.levels, this.raw, t0, t1, count);
  }
}

/** Peaks of a take being recorded, growing as samples arrive */
export class LivePeaks implements PeakSource {
  readonly sampleRate: number;
  length = 0;
  absMax = 0;
  private min = new Float32Array(1024);
  private max = new Float32Array(1024);
  private buckets = 0;
  private partialMin = Infinity;
  private partialMax = -Infinity;
  private partialCount = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  push(samples: Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      if (v < this.partialMin) this.partialMin = v;
      if (v > this.partialMax) this.partialMax = v;
      if (Math.abs(v) > this.absMax) this.absMax = Math.abs(v);
      if (++this.partialCount === BASE_BUCKET) this.commitBucket();
    }
    this.length += samples.length;
  }

  private commitBucket() {
    if (this.buckets === this.min.length) {
      const min = new Float32Array(this.min.length * 2);
      const max = new Float32Array(this.max.length * 2);
      min.set(this.min);
      max.set(this.max);
      this.min = min;
      this.max = max;
    }
    this.min[this.buckets] = this.partialMin;
    this.max[this.buckets] = this.partialMax;
    this.buckets++;
    this.partialMin = Infinity;
    this.partialMax = -Infinity;
    this.partialCount = 0;
  }

  columns(t0: number, t1: number, count: number): PeakColumns {
    const level: Level = { bucket: BASE_BUCKET, min: this.min.subarray(0, this.buckets), max: this.max.subarray(0, this.buckets) };
    return fillColumns({ sampleRate: this.sampleRate, length: this.buckets * BASE_BUCKET }, [level], null, t0, t1, count);
  }
}
