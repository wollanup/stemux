import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampHeaderWidth,
  clampLaneHeight,
  HEADER_WIDTH_DEFAULT,
  HEADER_WIDTH_MAX,
  HEADER_WIDTH_MIN,
  LANE_HEIGHT_MAX,
  LANE_HEIGHT_MIN,
  loadHeaderWidth,
  saveHeaderWidth,
} from '../layout';

describe('resizable sizes', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the header column and track heights within bounds', () => {
    expect(clampHeaderWidth(10)).toBe(HEADER_WIDTH_MIN);
    expect(clampHeaderWidth(9999)).toBe(HEADER_WIDTH_MAX);
    expect(clampHeaderWidth(333.6)).toBe(334);
    expect(clampLaneHeight(0)).toBe(LANE_HEIGHT_MIN);
    expect(clampLaneHeight(9999)).toBe(LANE_HEIGHT_MAX);
  });

  it('remembers the header column width', () => {
    expect(loadHeaderWidth()).toBe(HEADER_WIDTH_DEFAULT);
    saveHeaderWidth(360);
    expect(loadHeaderWidth()).toBe(360);
    saveHeaderWidth(null);
    expect(loadHeaderWidth()).toBe(HEADER_WIDTH_DEFAULT);
  });

  it('ignores a stored width that is invalid or out of bounds', () => {
    localStorage.setItem('timeline-header-width', 'abc');
    expect(loadHeaderWidth()).toBe(HEADER_WIDTH_DEFAULT);
    localStorage.setItem('timeline-header-width', '5000');
    expect(loadHeaderWidth()).toBe(HEADER_WIDTH_MAX);
  });
});
