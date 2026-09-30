import { describe, expect, it } from 'vitest';
import { FALL_DB_PER_S, formatDb, HOLD_S, meterPosition, METER_FLOOR_DB, silentMeter, stepMeter, toDb } from '../meterMath';

describe('level meter', () => {
  it('converts peaks to dBFS, with a floor', () => {
    expect(toDb(1)).toBe(0);
    expect(toDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(toDb(0)).toBe(METER_FLOOR_DB);
    expect(toDb(1e-9)).toBe(METER_FLOOR_DB);
  });

  it('maps the scale to the meter height', () => {
    expect(meterPosition(METER_FLOOR_DB)).toBe(0);
    expect(meterPosition(-30)).toBe(0.5);
    expect(meterPosition(0)).toBe(1);
    expect(meterPosition(3)).toBe(1);
  });

  it('rises at once and falls smoothly', () => {
    let m = stepMeter(silentMeter(), -6, 0.016);
    expect(m.level).toBe(-6);
    m = stepMeter(m, METER_FLOOR_DB, 0.5);
    expect(m.level).toBeCloseTo(-6 - FALL_DB_PER_S * 0.5);
  });

  it('holds the peak line, then lets it fall', () => {
    let m = stepMeter(silentMeter(), -3, 0.016);
    m = stepMeter(m, -20, HOLD_S / 2);
    expect(m.hold).toBe(-3);
    m = stepMeter(m, -20, HOLD_S);
    expect(m.hold).toBeLessThan(-3);
    expect(m.hold).toBeGreaterThanOrEqual(m.level);
  });

  it('formats peaks', () => {
    expect(formatDb(-3.21)).toBe('-3.2 dB');
    expect(formatDb(0.5)).toBe('+0.5 dB');
    expect(formatDb(METER_FLOOR_DB)).toBe('-∞ dB');
  });
});
