import { describe, expect, it } from 'vitest';
import { LOOP_COLORS, MARKER_COLOR, loopColor, markerColor, nextColor } from '../colors';

const loop = (id: string, start: string, end: string, color?: string) => ({ id, startMarkerId: start, endMarkerId: end, enabled: false, createdAt: 0, color });

describe('nextColor', () => {
  it('takes the first free color, then cycles', () => {
    expect(nextColor(['r', 'g', 'b'], [])).toBe('r');
    expect(nextColor(['r', 'g', 'b'], ['r', 'b'])).toBe('g');
    expect(nextColor(['r', 'g', 'b'], ['r', 'g', 'b', 'r'])).toBe('g');
  });
});

describe('loopColor', () => {
  it('uses the saved color, or one from the loop position', () => {
    const loops = [loop('l1', 'a', 'b'), loop('l2', 'c', 'd', '#123456')];
    expect(loopColor(loops[0], loops)).toBe(LOOP_COLORS[0]);
    expect(loopColor(loops[1], loops)).toBe('#123456');
  });
});

describe('markerColor', () => {
  const loops = [loop('l1', 'a', 'b', '#111111'), loop('l2', 'b', 'c', '#222222')];

  it('uses the color of its loop, the active one when shared', () => {
    expect(markerColor('a', { loops, activeLoopId: null })).toBe('#111111');
    expect(markerColor('b', { loops, activeLoopId: null })).toBe('#111111');
    expect(markerColor('b', { loops, activeLoopId: 'l2' })).toBe('#222222');
  });

  it('uses the marker color outside any loop', () => {
    expect(markerColor('z', { loops, activeLoopId: null })).toBe(MARKER_COLOR);
  });
});
