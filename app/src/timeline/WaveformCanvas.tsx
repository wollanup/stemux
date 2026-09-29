/**
 * Draws a clip's waveform for the VISIBLE part of the timeline only.
 * The canvas is as wide as the viewport and follows the scroll; it redraws
 * on scroll/zoom without React re-renders.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { PeakSource } from './peaks';
import { getView, subscribeView } from './viewStore';

interface WaveformCanvasProps {
  source: PeakSource | null;
  /** Position of the clip on the timeline (seconds) */
  offset: number;
  color: string;
  height: number;
  barStyle: 'modern' | 'classic';
  normalize: boolean;
  /** Redraw every frame (take being recorded) */
  animate?: boolean;
}

const BAR_WIDTH = 3;
const BAR_STEP = 5;

export default function WaveformCanvas({ source, offset, color, height, barStyle, normalize, animate }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { pxPerSec, scrollLeft, viewportWidth } = getView();
    const width = Math.max(1, Math.floor(viewportWidth));
    const dpr = window.devicePixelRatio || 1;

    canvas.style.left = `${scrollLeft}px`;
    canvas.style.width = `${width}px`;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    if (!source || source.length === 0 || pxPerSec <= 0) return;

    const scale = normalize && source.absMax > 0 ? 0.95 / source.absMax : 1;
    // Never draw outside the clip
    const clipStart = offset * pxPerSec - scrollLeft;
    const clipEnd = clipStart + (source.length / source.sampleRate) * pxPerSec;
    const mid = height / 2;
    const half = (height / 2) * 0.9;
    g.fillStyle = color;

    if (barStyle === 'modern') {
      // Bars aligned on the content grid so they do not shimmer while scrolling
      const firstBar = Math.floor(scrollLeft / BAR_STEP);
      const count = Math.ceil(width / BAR_STEP) + 1;
      const t0 = (firstBar * BAR_STEP) / pxPerSec - offset;
      const { min, max } = source.columns(t0, t0 + (count * BAR_STEP) / pxPerSec, count);
      for (let i = 0; i < count; i++) {
        if (Number.isNaN(max[i])) continue;
        const amp = Math.min(1, Math.max(Math.abs(min[i]), Math.abs(max[i])) * scale);
        const h = Math.max(1, amp * half * 2);
        const x = firstBar * BAR_STEP + i * BAR_STEP - scrollLeft;
        if (x < clipStart - 0.5 || x + BAR_WIDTH > clipEnd + 0.5) continue;
        g.beginPath();
        g.roundRect(x, mid - h / 2, BAR_WIDTH, h, BAR_WIDTH / 2);
        g.fill();
      }
    } else {
      const first = Math.floor(scrollLeft);
      const count = width + 1;
      const t0 = first / pxPerSec - offset;
      const { min, max } = source.columns(t0, t0 + count / pxPerSec, count);
      for (let i = 0; i < count; i++) {
        if (Number.isNaN(max[i])) continue;
        const x = first + i - scrollLeft;
        if (x < clipStart - 0.5 || x > clipEnd) continue;
        const top = mid - Math.min(1, max[i] * scale) * half;
        const bottom = mid - Math.max(-1, min[i] * scale) * half;
        g.fillRect(x, top, 1, Math.max(1, bottom - top));
      }
    }
  }, [source, offset, color, height, barStyle, normalize]);

  useEffect(() => {
    draw();
    return subscribeView(draw);
  }, [draw]);

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, height, pointerEvents: 'none', display: 'block' }}
    />
  );
}
