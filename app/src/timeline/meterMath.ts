/**
 * Level meter ballistics: the bar rises at once and falls smoothly, a
 * peak-hold line stays on the highest recent peak.
 */

/** Bottom of the scale (dBFS) */
export const METER_FLOOR_DB = -60;
/** The bar falls this fast (dB per second) */
export const FALL_DB_PER_S = 24;
/** The peak line stays this long before falling */
export const HOLD_S = 1.2;
const HOLD_FALL_DB_PER_S = 20;
/** Colors change at these levels (dBFS) */
export const WARN_DB = -12;
export const DANGER_DB = -3;

export const toDb = (peak: number) => (peak > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(peak)) : METER_FLOOR_DB);

/** Height of a level on the meter, 0 (floor) to 1 (0 dBFS and above) */
export const meterPosition = (db: number) => Math.max(0, Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));

export interface ChannelMeter {
  /** Level shown by the bar (dB) */
  level: number;
  /** Peak-hold line (dB) and how long it has been held (s) */
  hold: number;
  holdAge: number;
}

export const silentMeter = (): ChannelMeter => ({ level: METER_FLOOR_DB, hold: METER_FLOOR_DB, holdAge: 0 });

/** Next state of a channel after `dt` seconds with a new peak (dB) */
export function stepMeter(meter: ChannelMeter, peakDb: number, dt: number): ChannelMeter {
  const level = Math.max(peakDb, meter.level - FALL_DB_PER_S * dt, METER_FLOOR_DB);
  if (peakDb >= meter.hold) return { level, hold: peakDb, holdAge: 0 };
  const holdAge = meter.holdAge + dt;
  const hold = holdAge > HOLD_S ? Math.max(level, meter.hold - HOLD_FALL_DB_PER_S * dt) : meter.hold;
  return { level, hold, holdAge };
}

/** Peak label, "-3.2 dB", "-∞" below the floor */
export const formatDb = (db: number) => (db <= METER_FLOOR_DB ? '-∞ dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`);
