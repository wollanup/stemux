/**
 * Vertical peak meter of a track (dBFS, after its volume, mute and solo):
 * one bar per channel, a peak-hold line, and a clip light on top once the
 * track reached 0 dBFS. The highest peak is in the tooltip; a click resets it.
 */

import { useEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { audioEngine } from '../audio/AudioEngine';
import { DANGER_DB, formatDb, meterPosition, METER_FLOOR_DB, silentMeter, stepMeter, toDb, WARN_DB, type ChannelMeter } from './meterMath';

/** Width of the meter (px), both bars */
export const PEAK_METER_WIDTH = 9;
const CLIP_LIGHT_PX = 3;

export default function PeakMeter({ trackId }: { trackId: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maxDb = useRef(METER_FLOOR_DB);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let meters: ChannelMeter[] = [];
    let last = performance.now();
    let lastTitle = 0;
    let raf = 0;
    const colors = { ok: theme.palette.success.main, warn: theme.palette.warning.main, danger: theme.palette.error.main };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const peaks = audioEngine.getTrackPeaks(trackId) ?? [];
      if (meters.length !== peaks.length) meters = peaks.map(silentMeter);
      const idle = meters.every((m) => m.level <= METER_FLOOR_DB && m.hold <= METER_FLOOR_DB) && peaks.every((p) => p === 0);
      meters = meters.map((m, i) => stepMeter(m, toDb(peaks[i]), dt));
      for (const peak of peaks) maxDb.current = Math.max(maxDb.current, toDb(peak));
      if (now - lastTitle > 250) {
        lastTitle = now;
        canvas.title = t('track.peak', { value: formatDb(maxDb.current) });
      }
      if (idle && canvas.dataset.drawn === 'idle') return;
      canvas.dataset.drawn = idle ? 'idle' : 'live';

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
      if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);

      const barsTop = CLIP_LIGHT_PX + 1;
      const barsHeight = Math.max(0, height - barsTop);
      const y = (db: number) => barsTop + barsHeight * (1 - meterPosition(db));
      const channels = Math.max(1, meters.length);
      const gap = 1;
      const barWidth = (width - gap * (channels - 1)) / channels;

      // Clip light: the track reached 0 dBFS since the last reset
      g.fillStyle = maxDb.current >= 0 ? colors.danger : theme.palette.action.selected;
      g.fillRect(0, 0, width, CLIP_LIGHT_PX);

      for (let i = 0; i < channels; i++) {
        const x = i * (barWidth + gap);
        const meter = meters[i] ?? silentMeter();
        g.fillStyle = theme.palette.action.selected;
        g.fillRect(x, barsTop, barWidth, barsHeight);
        // Bar in three zones: safe, loud, about to clip
        const zones: Array<[number, number, string]> = [
          [METER_FLOOR_DB, WARN_DB, colors.ok],
          [WARN_DB, DANGER_DB, colors.warn],
          [DANGER_DB, 0, colors.danger],
        ];
        for (const [from, to, color] of zones) {
          if (meter.level <= from) break;
          const top = y(Math.min(meter.level, to));
          g.fillStyle = color;
          g.fillRect(x, top, barWidth, y(from) - top);
        }
        if (meter.hold > METER_FLOOR_DB) {
          g.fillStyle = meter.hold >= DANGER_DB ? colors.danger : theme.palette.text.primary;
          g.fillRect(x, Math.round(y(meter.hold)), barWidth, 1.5);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [trackId, theme, t]);

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      data-peak-meter={trackId}
      aria-label={t('track.meter')}
      role="img"
      onClick={(e) => {
        e.stopPropagation();
        maxDb.current = METER_FLOOR_DB;
        if (canvasRef.current) canvasRef.current.dataset.drawn = '';
      }}
      sx={{ display: 'block', width: PEAK_METER_WIDTH, height: '100%', cursor: 'pointer' }}
    />
  );
}
