/**
 * Tempo grid: a constant tempo and time signature per piece, and where bar 1
 * starts. Beats are counted in the unit of the signature (quarter notes in
 * 4/4, eighth notes in 6/8), so `bpm` is in that unit.
 */

import type { Tempo } from '../types/audio';

export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const DEFAULT_TEMPO: Tempo = { bpm: 120, beatsPerBar: 4, beatUnit: 4, offset: 0 };

export const clampBpm = (bpm: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm * 100) / 100));

export const beatSeconds = (tempo: Tempo) => 60 / tempo.bpm;
export const barSeconds = (tempo: Tempo) => beatSeconds(tempo) * tempo.beatsPerBar;

/** Beat number (0 = first beat of bar 1, may be negative before it) at a time */
export const beatAt = (time: number, tempo: Tempo) => (time - tempo.offset) / beatSeconds(tempo);

export const timeOfBeat = (beat: number, tempo: Tempo) => tempo.offset + beat * beatSeconds(tempo);

/** Bar and beat at a time, both from 1: "bar 3, beat 2" */
export function barBeatAt(time: number, tempo: Tempo): { bar: number; beat: number } {
  const beat = Math.floor(beatAt(time, tempo) + 1e-6);
  const bar = Math.floor(beat / tempo.beatsPerBar);
  return { bar: bar + 1, beat: beat - bar * tempo.beatsPerBar + 1 };
}

/** "12.3" = bar 12, beat 3 */
export function formatBarBeat(time: number, tempo: Tempo): string {
  const { bar, beat } = barBeatAt(time, tempo);
  return `${bar}.${beat}`;
}

/** Bar 1 at the same place as `time` modulo one bar: moves the grid without changing the tempo */
export const offsetFromDownbeat = (time: number, tempo: Tempo) => {
  const bar = barSeconds(tempo);
  return ((time % bar) + bar) % bar;
};

export interface GridTick {
  time: number;
  /** Bar number (from 1) when the tick starts a bar */
  bar?: number;
  /** Label the bar (not every bar is labelled when zoomed out) */
  label: boolean;
}

/** Minimum spacing on screen, in px */
const MIN_BEAT_PX = 10;
const MIN_LABEL_PX = 44;

/**
 * Grid lines between two times: every beat when there is room, otherwise
 * bars only, or every 2, 4, 8... bars. Labels are spaced out alike.
 */
export function gridTicks(from: number, to: number, pxPerSec: number, tempo: Tempo): GridTick[] {
  const beatPx = beatSeconds(tempo) * pxPerSec;
  const barPx = beatPx * tempo.beatsPerBar;
  const showBeats = beatPx >= MIN_BEAT_PX;
  let barStep = 1;
  while (!showBeats && barPx * barStep < MIN_BEAT_PX) barStep *= 2;
  let labelStep = 1;
  while (barPx * labelStep < MIN_LABEL_PX) labelStep *= 2;

  const ticks: GridTick[] = [];
  const firstBeat = Math.floor(beatAt(from, tempo));
  const lastBeat = Math.ceil(beatAt(to, tempo));
  if (lastBeat - firstBeat > 20000) return ticks;
  for (let beat = firstBeat; beat <= lastBeat; beat++) {
    const inBar = ((beat % tempo.beatsPerBar) + tempo.beatsPerBar) % tempo.beatsPerBar;
    const barIndex = (beat - inBar) / tempo.beatsPerBar;
    if (inBar === 0) {
      if (((barIndex % barStep) + barStep) % barStep !== 0) continue;
      ticks.push({ time: timeOfBeat(beat, tempo), bar: barIndex + 1, label: ((barIndex % labelStep) + labelStep) % labelStep === 0 });
    } else if (showBeats) {
      ticks.push({ time: timeOfBeat(beat, tempo), label: false });
    }
  }
  return ticks;
}

/** Grid times near a time (the beats around it), to snap to */
export function gridSnapTargets(time: number, tempo: Tempo, span = 2): number[] {
  const beat = Math.round(beatAt(time, tempo));
  const targets: number[] = [];
  for (let b = beat - span; b <= beat + span; b++) targets.push(timeOfBeat(b, tempo));
  return targets.filter((t) => t >= 0);
}
