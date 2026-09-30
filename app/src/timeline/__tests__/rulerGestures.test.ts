import { describe, expect, it } from 'vitest';
import { cursorFor, HANDLE_WIDTH, hitTest, loopShift, loopStartMarkerIds, MARKER_GRAB_PX, resolveGesture, scrubTime } from '../rulerGestures';
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
  it('the graduation only moves the playhead, even over a marker', () => {
    expect(hitTest(100, false, state, PPS)).toEqual({ kind: 'time' });
    expect(hitTest(200 + HANDLE_WIDTH - 1, false, state, PPS)).toEqual({ kind: 'time' });
  });

  it('grabs a marker on its line in the loop strip', () => {
    expect(hitTest(100 + MARKER_GRAB_PX - 1, true, state, PPS)).toMatchObject({ kind: 'marker', markerId: 'a' });
  });

  it('grabs a loop start by its handle, drawn on the left of the line', () => {
    expect(loopStartMarkerIds(state)).toEqual(new Set(['a', 'c']));
    expect(hitTest(100 - HANDLE_WIDTH + 1, true, state, PPS)).toMatchObject({ markerId: 'a' });
    // Right of the line: not this marker (here it is the handle of 'c', at 12s)
    expect(hitTest(100 + MARKER_GRAB_PX + 2, true, state, PPS)).not.toMatchObject({ markerId: 'a' });
  });

  it('grabs a loop end by its handle, drawn on the right of the line', () => {
    expect(hitTest(200 + HANDLE_WIDTH - 1, true, state, PPS)).toMatchObject({ markerId: 'b' });
    expect(hitTest(200 - MARKER_GRAB_PX - 2, true, state, PPS)).toMatchObject({ kind: 'loop', loopId: 'big' });
  });

  it('knows the innermost loop under the pointer in the strip, with its bounds', () => {
    expect(hitTest(140, true, state, PPS)).toEqual({ kind: 'loop', loopId: 'small', start: 12, end: 16 });
    expect(hitTest(185, true, state, PPS)).toEqual({ kind: 'loop', loopId: 'big', start: 10, end: 20 });
    expect(hitTest(400, true, state, PPS)).toEqual({ kind: 'strip' });
  });

  it('grabs the closest marker when handles overlap', () => {
    const close = { markers: [{ id: 'x', time: 1, createdAt: 0 }, { id: 'y', time: 1.5, createdAt: 0 }], loops: [] };
    expect(hitTest(14, true, close, PPS)).toMatchObject({ markerId: 'y' });
  });

  it('puts the handle of the earliest marker of a loop on the left', () => {
    const swapped = { markers: state.markers, loops: [{ id: 'l', startMarkerId: 'b', endMarkerId: 'a', enabled: false, createdAt: 0 }] };
    expect(loopStartMarkerIds(swapped)).toEqual(new Set(['a']));
  });
});

describe('resolveGesture', () => {
  it('graduation: the playhead ends where the pointer is released', () => {
    expect(resolveGesture({ kind: 'time' }, 250, 251, PPS, 60)).toEqual({ type: 'seek', time: 25.1 });
    // A drag is a precise placement, not a loop
    expect(resolveGesture({ kind: 'time' }, 250, 320, PPS, 60)).toEqual({ type: 'seek', time: 32 });
  });

  it('graduation: scrubbing stays within the piece', () => {
    expect(scrubTime(-50, PPS, 60)).toBe(0);
    expect(scrubTime(900, PPS, 60)).toBe(60);
    expect(scrubTime(123, PPS, 60)).toBe(12.3);
  });

  it('loop strip: a click adds a marker (no playhead move)', () => {
    expect(resolveGesture({ kind: 'strip' }, 140, 141, PPS, 60)).toEqual({ type: 'addMarker', time: 14.1 });
  });

  it('loop strip: a drag creates a loop, in either direction, within the piece', () => {
    expect(resolveGesture({ kind: 'strip' }, 300, 450, PPS, 60)).toEqual({ type: 'createLoop', start: 30, end: 45 });
    expect(resolveGesture({ kind: 'strip' }, 450, 300, PPS, 60)).toEqual({ type: 'createLoop', start: 30, end: 45 });
    expect(resolveGesture({ kind: 'strip' }, 550, 900, PPS, 60)).toEqual({ type: 'createLoop', start: 55, end: 60 });
  });

  it('loop strip: ignores a drag too short for a loop', () => {
    expect(resolveGesture({ kind: 'strip' }, 1000, 1050, 1000, 60)).toEqual({ type: 'none' });
  });

  it('loop: a click does nothing (a double click plays it), a drag moves it', () => {
    const big = { kind: 'loop', loopId: 'big', start: 10, end: 20 } as const;
    expect(resolveGesture(big, 150, 151, PPS, 60)).toEqual({ type: 'none' });
    expect(resolveGesture(big, 150, 200, PPS, 60)).toEqual({ type: 'moveLoop', loopId: 'big', delta: 5 });
    expect(resolveGesture(big, 150, 100, PPS, 60)).toEqual({ type: 'moveLoop', loopId: 'big', delta: -5 });
  });

  it('loop: a moved loop stays within the piece', () => {
    const big = { kind: 'loop', loopId: 'big', start: 10, end: 20 } as const;
    expect(loopShift(big, 150, -500, PPS, 60)).toBe(-10);
    expect(loopShift(big, 150, 2000, PPS, 60)).toBe(40);
    // Already at the start: dragging further left does nothing
    expect(resolveGesture({ ...big, start: 0, end: 10 }, 50, 0, PPS, 60)).toEqual({ type: 'none' });
  });

  it('marker handle: a click seeks to it, a drag moves it', () => {
    expect(resolveGesture({ kind: 'marker', markerId: 'a', time: 10 }, 103, 103, PPS, 60)).toEqual({ type: 'seek', time: 10 });
    expect(resolveGesture({ kind: 'marker', markerId: 'b', time: 20 }, 200, 230, PPS, 60)).toEqual({ type: 'moveMarker', markerId: 'b', time: 23 });
  });
});

describe('cursorFor', () => {
  it('shows a horizontal arrow on handles and a hand on the graduation', () => {
    expect(cursorFor({ kind: 'marker', markerId: 'a', time: 10 })).toBe('ew-resize');
    expect(cursorFor({ kind: 'time' })).toBe('pointer');
    expect(cursorFor({ kind: 'strip' })).toBe('copy');
  });

  it('shows a grab hand on loops, a crosshair while drawing a new one', () => {
    const loop = { kind: 'loop', loopId: 'big', start: 10, end: 20 } as const;
    expect(cursorFor(loop)).toBe('grab');
    expect(cursorFor(loop, true)).toBe('grabbing');
    expect(cursorFor({ kind: 'strip' }, true)).toBe('crosshair');
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
