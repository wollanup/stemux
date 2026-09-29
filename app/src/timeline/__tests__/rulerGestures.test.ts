import { describe, expect, it } from 'vitest';
import { hitTest, MARKER_GRAB_PX, resolveGesture } from '../rulerGestures';
import { zoomInFrom, zoomOutFrom, sliderFromZoom, zoomFromSlider } from '../zoom';

const PPS = 10;
const state = {
  markers: [
    { id: 'a', time: 10, createdAt: 0 },
    { id: 'b', time: 20, createdAt: 0 },
    { id: 'c', time: 12, createdAt: 0 },
    { id: 'd', time: 16, createdAt: 0 },
  ],
  loops: [
    { id: 'big', startMarkerId: 'a', endMarkerId: 'b', enabled: false, createdAt: 0 },
    { id: 'small', startMarkerId: 'c', endMarkerId: 'd', enabled: false, createdAt: 0 },
  ],
};

describe('hitTest', () => {
  it('grabs a marker within a few pixels', () => {
    expect(hitTest(100 + MARKER_GRAB_PX - 1, false, state, PPS)).toMatchObject({ kind: 'marker', markerId: 'a' });
    expect(hitTest(100 + MARKER_GRAB_PX + 2, false, state, PPS)).toEqual({ kind: 'empty' });
  });

  it('grabs the closest marker', () => {
    const close = { markers: [{ id: 'x', time: 1, createdAt: 0 }, { id: 'y', time: 1.5, createdAt: 0 }], loops: [] };
    expect(hitTest(14, false, close, PPS)).toMatchObject({ markerId: 'y' });
  });

  it('finds the innermost loop in the loop strip', () => {
    expect(hitTest(140, true, state, PPS)).toEqual({ kind: 'loop', loopId: 'small' });
    expect(hitTest(180, true, state, PPS)).toEqual({ kind: 'loop', loopId: 'big' });
  });

  it('ignores loops outside the loop strip', () => {
    expect(hitTest(140, false, state, PPS)).toEqual({ kind: 'empty' });
  });
});

describe('resolveGesture', () => {
  it('seeks on a click', () => {
    expect(resolveGesture({ kind: 'empty' }, 250, 251, PPS, 60)).toEqual({ type: 'seek', time: 25 });
  });

  it('seeks to a marker when it is clicked', () => {
    expect(resolveGesture({ kind: 'marker', markerId: 'a', time: 10 }, 103, 103, PPS, 60)).toEqual({ type: 'seek', time: 10 });
  });

  it('creates a loop when dragging, in either direction', () => {
    expect(resolveGesture({ kind: 'empty' }, 300, 450, PPS, 60)).toEqual({ type: 'createLoop', start: 30, end: 45 });
    expect(resolveGesture({ kind: 'empty' }, 450, 300, PPS, 60)).toEqual({ type: 'createLoop', start: 30, end: 45 });
  });

  it('clamps loops to the piece', () => {
    expect(resolveGesture({ kind: 'empty' }, 550, 900, PPS, 60)).toEqual({ type: 'createLoop', start: 55, end: 60 });
  });

  it('moves a dragged marker', () => {
    expect(resolveGesture({ kind: 'marker', markerId: 'b', time: 20 }, 200, 230, PPS, 60)).toEqual({ type: 'moveMarker', markerId: 'b', time: 23 });
  });

  it('toggles a clicked loop', () => {
    expect(resolveGesture({ kind: 'loop', loopId: 'small' }, 140, 141, PPS, 60)).toEqual({ type: 'toggleLoop', loopId: 'small' });
  });

  it('ignores a drag too short for a loop', () => {
    const pps = 1000;
    expect(resolveGesture({ kind: 'empty' }, 1000, 1050, pps, 60)).toEqual({ type: 'none' });
  });
});

describe('zoom presets', () => {
  it('round-trips presets through the slider', () => {
    for (const zoom of [0, 1, 5, 10, 50, 250, 500]) expect(zoomFromSlider(sliderFromZoom(zoom))).toBe(zoom);
  });

  it('zooms in from the effective scale', () => {
    // "Fit" is 6.3 px/s: next preset is 10
    expect(zoomInFrom(6.3)).toBe(10);
    expect(zoomInFrom(500)).toBe(500);
  });

  it('goes back to fit when the previous preset is below it', () => {
    expect(zoomOutFrom(50, 6.3)).toBe(10);
    expect(zoomOutFrom(10, 6.3)).toBe(0);
  });
});
