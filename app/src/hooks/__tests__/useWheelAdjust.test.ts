import { describe, expect, it } from 'vitest';
import { wheelSteps, WHEEL_STEP_PX } from '../useWheelAdjust';

describe('wheel steps', () => {
  it('wheel up is a positive step, down a negative one', () => {
    expect(wheelSteps(0, -WHEEL_STEP_PX)).toEqual({ steps: 1, rest: 0 });
    expect(wheelSteps(0, 2 * WHEEL_STEP_PX)).toEqual({ steps: -2, rest: 0 });
  });

  it('adds up small touchpad deltas', () => {
    let rest = 0;
    let steps = 0;
    for (let i = 0; i < 10; i++) {
      const result = wheelSteps(rest, -10);
      rest = result.rest;
      steps += result.steps;
    }
    expect(steps).toBe(2);
    expect(rest).toBe(0);
  });

  it('counts lines and pages in pixels', () => {
    expect(wheelSteps(0, -3, 1).steps).toBe(2);
    expect(wheelSteps(0, 1, 2).steps).toBe(-4);
  });
});
