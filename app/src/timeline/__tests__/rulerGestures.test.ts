import { describe, expect, it } from 'vitest';
import { cursorFor, HANDLE_WIDTH, hitTest, loopStartMarkerIds, MARKER_GRAB_PX, resolveGesture } from '../rulerGestures';
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
  it('grabs a marker on its line', () => {
    expect(hitTest(100 - MARKER_GRAB_PX + 1, false, state, PPS)).toMatchObject({ kind: 'marker', markerId: 'a' });
  });

  it('grabs a loop start by its handle, drawn on the left of the line', () => {
    expect(loopStartMarkerIds(state)).toEqual(new Set(['a', 'c']));
    expect(hitTest(100 - HANDLE_WIDTH + 1, false, state, PPS)).toMatchObject({ markerId: 'a' });
    // Right of the line: not this marker (here it is the handle of 'c', at 12s)
    expect(hitTest(100 + MARKER_GRAB_PX + 2, false, state, PPS)).not.toMatchObject({ markerId: 'a' });
  });

  it('grabs a loop end by its handle, drawn on the right of the line', () => {
    expect(hitTest(200 + HANDLE_WIDTH - 1, false, state, PPS)).toMatchObject({ markerId: 'b' });
    expect(hitTest(200 - MARKER_GRAB_PX - 2, false, state, PPS)).toEqual({ kind: 'empty' });
  });

  it('grabs the closest marker when handles overlap', () => {
    const close = { markers: [{ id: 'x', time: 1, createdAt: 0 }, { id: 'y', time: 1.5, createdAt: 0 }], loops: [] };
    expect(hitTest(14, false, close, PPS)).toMatchObject({ markerId: 'y' });
  });

  it('uses the handle side of the dragged position of a loop marker', () => {
    // A loop whose "end" marker is earlier than its "start" marker
    const swapped = { markers: state.markers, loops: [{ id: 'l', startMarkerId: 'b', endMarkerId: 'a', enabled: false, createdAt: 0 }] };
    expect(loopStartMarkerIds(swapped)).toEqual(new Set(['a']));
  });

  it('tells the loop strip from the graduation', () => {
    expect(hitTest(140, true, state, PPS)).toEqual({ kind: 'strip' });
    expect(hitTest(140, false, state, PPS)).toEqual({ kind: 'empty' });
  });
});

describe('resolveGesture', () => {
  it('seeks on a click on the graduation', () => {
    expect(resolveGesture({ kind: 'empty' }, 250, 251, PPS, 60)).toEqual({ type: 'seek', time: 25 });
  });

  it('does nothing on a click in the loop strip (no playhead move)', () => {
    expect(resolveGesture({ kind: 'strip' }, 140, 141, PPS, 60)).toEqual({ type: 'none' });
  });

  it('seeks to a marker when it is clicked', () => {
    expect(resolveGesture({ kind: 'marker', markerId: 'a', time: 10 }, 103, 103, PPS, 60)).toEqual({ type: 'seek', time: 10 });
  });

  it('creates a loop when dragging, in either direction, from the graduation or the strip', () => {
    expect(resolveGesture({ kind: 'empty' }, 300, 450, PPS, 60)).toEqual({ type: 'createLoop', start: 30, end: 45 });
    expect(resolveGesture({ kind: 'strip' }, 450, 300, PPS, 60)).toEqual({ type: 'createLoop', start: 30, end: 45 });
  });

  it('clamps loops to the piece', () => {
    expect(resolveGesture({ kind: 'empty' }, 550, 900, PPS, 60)).toEqual({ type: 'createLoop', start: 55, end: 60 });
  });

  it('moves a dragged marker', () => {
    expect(resolveGesture({ kind: 'marker', markerId: 'b', time: 20 }, 200, 230, PPS, 60)).toEqual({ type: 'moveMarker', markerId: 'b', time: 23 });
  });

  it('ignores a drag too short for a loop', () => {
    expect(resolveGesture({ kind: 'empty' }, 1000, 1050, 1000, 60)).toEqual({ type: 'none' });
  });
});

describe('cursorFor', () => {
  it('shows a horizontal arrow on handles and a hand where a click seeks', () => {
    expect(cursorFor({ kind: 'marker', markerId: 'a', time: 10 })).toBe('ew-resize');
    expect(cursorFor({ kind: 'empty' })).toBe('pointer');
    expect(cursorFor({ kind: 'strip' })).toBe('default');
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
