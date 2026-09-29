import { describe, expect, it } from 'vitest';
import {
  clampScroll,
  contentWidth,
  followScroll,
  formatTimeLabel,
  pxPerSecond,
  pxToTime,
  scrollForAnchor,
  tickSpacing,
  ticks,
  timeToPx,
  visibleRange,
} from '../timelineMath';

describe('scale', () => {
  it('fits the whole piece at zoom 0', () => {
    expect(pxPerSecond(0, 1800, 180)).toBe(10);
  });

  it('uses the zoom level as px per second', () => {
    expect(pxPerSecond(50, 1800, 180)).toBe(50);
  });

  it('never zooms out below "fit"', () => {
    expect(pxPerSecond(1, 1800, 180)).toBe(10);
  });

  it('has a sane scale without audio', () => {
    expect(pxPerSecond(0, 1800, 0)).toBe(1);
  });

  it('converts both ways', () => {
    expect(timeToPx(12.5, 40)).toBe(500);
    expect(pxToTime(500, 40)).toBe(12.5);
  });

  it('makes the content at least as wide as the viewport', () => {
    expect(contentWidth(10, 10, 800)).toBe(800);
    expect(contentWidth(180, 50, 800)).toBe(9000);
  });
});

describe('scroll', () => {
  it('computes the visible time range', () => {
    expect(visibleRange(1000, 500, 100)).toEqual({ start: 10, end: 15 });
  });

  it('clamps the scroll to the content', () => {
    expect(clampScroll(-5, 1000, 400)).toBe(0);
    expect(clampScroll(900, 1000, 400)).toBe(600);
    expect(clampScroll(100, 300, 400)).toBe(0);
  });

  it('keeps the anchor under the same x after zooming', () => {
    // 20s was at x=300 → after zoom to 100 px/s it must still be at x=300
    const scroll = scrollForAnchor(20, 300, 100);
    expect(20 * 100 - scroll).toBe(300);
  });

  it('does not scroll while the playhead is visible', () => {
    expect(followScroll(12, 1000, 500, 100)).toBeNull();
  });

  it('flips to the next page when the playhead leaves the view', () => {
    const next = followScroll(15, 1000, 500, 100)!;
    expect(next).toBeGreaterThan(1000);
    expect(15 * 100 - next).toBeLessThan(500 * 0.1);
  });

  it('follows the playhead back to the start (loop jump)', () => {
    expect(followScroll(1, 1000, 500, 100)).toBe(75);
  });
});

describe('ruler graduation', () => {
  it('spaces labels at least ~64px apart', () => {
    for (const pps of [0.5, 3, 10, 47, 120, 500, 3000]) {
      const { major } = tickSpacing(pps);
      expect(major * pps).toBeGreaterThanOrEqual(64);
    }
  });

  it('picks round steps', () => {
    expect(tickSpacing(10).major).toBe(10);
    expect(tickSpacing(100).major).toBe(1);
    expect(tickSpacing(1).major).toBe(120);
  });

  it('aligns ticks on the grid whatever the scroll', () => {
    const list = ticks(3.3, 12, 10);
    expect(list[0].time).toBe(2);
    expect(list.filter((t) => t.major).map((t) => t.time)).toEqual([10]);
    list.forEach((t) => expect((t.time * 1e6) % (2 * 1e6)).toBeCloseTo(0, 3));
  });

  it('does not accumulate float errors', () => {
    const list = ticks(0, 60, 1000);
    expect(list.at(-1)!.time).toBe(60);
  });
});

describe('time labels', () => {
  it('formats m:ss', () => {
    expect(formatTimeLabel(0)).toBe('0:00');
    expect(formatTimeLabel(75)).toBe('1:15');
  });

  it('shows decimals for fine graduations', () => {
    expect(formatTimeLabel(1.5, 0.5)).toBe('0:01.5');
    expect(formatTimeLabel(0.05, 0.05)).toBe('0:00.05');
  });

  it('rounds up to the next minute cleanly', () => {
    expect(formatTimeLabel(59.99, 1)).toBe('1:00');
  });
});
