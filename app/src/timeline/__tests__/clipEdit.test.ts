import { describe, expect, it } from 'vitest';
import { clipZone, EDGE_PX, editClip, MIN_CLIP_SECONDS, moveClip, sameGeometry, trimClipEnd, trimClipStart } from '../clipEdit';
import { snapTargets, snapThreshold, snapToTargets } from '../snapping';

/** 20s file, 2s cut at the start, 10s kept, placed at 5s */
const clip = { offset: 5, trimStart: 2, duration: 10 };
const noSnap = { sourceDuration: 20, targets: [], snapThreshold: 0.2 };
const withTargets = (targets: number[]) => ({ ...noSnap, targets });

describe('clipZone', () => {
  it('finds the edges and the body', () => {
    expect(clipZone(2, 200)).toBe('start');
    expect(clipZone(EDGE_PX, 200)).toBe('start');
    expect(clipZone(100, 200)).toBe('body');
    expect(clipZone(199, 200)).toBe('end');
    expect(clipZone(-1, 200)).toBeNull();
    expect(clipZone(201, 200)).toBeNull();
  });

  it('keeps a body to grab on tiny clips', () => {
    expect(clipZone(5, 12)).toBe('body');
  });
});

describe('moveClip', () => {
  it('moves the clip without changing what is played', () => {
    expect(moveClip(clip, 3, noSnap).clip).toEqual({ offset: 8, trimStart: 2, duration: 10 });
  });

  it('never goes before the start of the piece', () => {
    expect(moveClip(clip, -9, noSnap).clip.offset).toBe(0);
  });

  it('snaps its start to a target', () => {
    const r = moveClip(clip, 2.9, withTargets([8]));
    expect(r.clip.offset).toBe(8);
    expect(r.snappedTo).toBe(8);
  });

  it('snaps its end to a target', () => {
    // End would be at 18.1: snaps to 18 → starts at 8
    const r = moveClip(clip, 3.1, withTargets([18]));
    expect(r.clip.offset).toBe(8);
    expect(r.snappedTo).toBe(18);
  });

  it('keeps the closest snap when both edges are near a target', () => {
    // Start at 8.15 (0.15 from 8), end at 18.05 (0.05 from 18.1)
    const r = moveClip(clip, 3.15, withTargets([8, 18.1]));
    expect(r.snappedTo).toBe(18.1);
    expect(r.clip.offset).toBeCloseTo(8.1, 9);
  });

  it('does not snap beyond the threshold', () => {
    expect(moveClip(clip, 3, withTargets([8.5])).snappedTo).toBeNull();
  });
});

describe('trimClipStart', () => {
  it('cuts more at the start, the end stays in place', () => {
    expect(trimClipStart(clip, 1, noSnap).clip).toEqual({ offset: 6, trimStart: 3, duration: 9 });
  });

  it('restores what was cut, not more than the file start', () => {
    expect(trimClipStart(clip, -1, noSnap).clip).toEqual({ offset: 4, trimStart: 1, duration: 11 });
    expect(trimClipStart(clip, -5, noSnap).clip).toEqual({ offset: 3, trimStart: 0, duration: 12 });
  });

  it('cannot go before the start of the piece', () => {
    const early = { offset: 1, trimStart: 3, duration: 5 };
    expect(trimClipStart(early, -2, noSnap).clip).toEqual({ offset: 0, trimStart: 2, duration: 6 });
  });

  it('keeps a minimum length', () => {
    expect(trimClipStart(clip, 50, noSnap).clip.duration).toBeCloseTo(MIN_CLIP_SECONDS, 9);
  });

  it('snaps the new start', () => {
    const r = trimClipStart(clip, 1.1, withTargets([6]));
    expect(r.clip.offset).toBe(6);
    expect(r.snappedTo).toBe(6);
  });
});

describe('trimClipEnd', () => {
  it('shortens and lengthens the end, the start stays in place', () => {
    expect(trimClipEnd(clip, -4, noSnap).clip).toEqual({ offset: 5, trimStart: 2, duration: 6 });
    expect(trimClipEnd(clip, 3, noSnap).clip).toEqual({ offset: 5, trimStart: 2, duration: 13 });
  });

  it('cannot go past the end of the file', () => {
    // 2s cut at the start of a 20s file: at most 18s
    expect(trimClipEnd(clip, 50, noSnap).clip.duration).toBe(18);
  });

  it('keeps a minimum length', () => {
    expect(trimClipEnd(clip, -50, noSnap).clip.duration).toBeCloseTo(MIN_CLIP_SECONDS, 9);
  });

  it('snaps the new end', () => {
    const r = trimClipEnd(clip, -2.9, withTargets([12]));
    expect(r.clip.duration).toBe(7);
    expect(r.snappedTo).toBe(12);
  });
});

describe('editClip', () => {
  it('dispatches on the zone', () => {
    expect(editClip('body', clip, 1, noSnap).clip.offset).toBe(6);
    expect(editClip('start', clip, 1, noSnap).clip.trimStart).toBe(3);
    expect(editClip('end', clip, 1, noSnap).clip.duration).toBe(11);
  });

  it('compares geometries', () => {
    expect(sameGeometry(clip, { ...clip })).toBe(true);
    expect(sameGeometry(clip, { ...clip, offset: 5.1 })).toBe(false);
  });
});

describe('snapping', () => {
  it('gathers the start of the piece, the playhead, markers and other clips', () => {
    const targets = snapTargets({
      markers: [{ id: 'm', time: 12, createdAt: 0 }],
      playhead: 7.5,
      clipEdges: [3, 12, 30],
    });
    expect(targets).toEqual([0, 3, 7.5, 12, 30]);
  });

  it('snaps to the nearest target within the threshold', () => {
    expect(snapToTargets(7.4, [0, 7, 7.5], 0.2)).toEqual({ time: 7.5, target: 7.5 });
    expect(snapToTargets(8, [0, 7, 7.5], 0.2)).toEqual({ time: 8, target: null });
  });

  it('uses a distance in pixels, the same at every zoom', () => {
    expect(snapThreshold(10)).toBeCloseTo(0.8, 9);
    expect(snapThreshold(400)).toBeCloseTo(0.02, 9);
  });
});
