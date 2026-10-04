/**
 * Bar and beat lines across the lanes, when the ruler counts bars. Drawn for
 * the visible part only, like the graduation.
 */

import { useCallback, useEffect, useRef } from 'react';
import { alpha } from '@mantine/core';
import { useAppPalette } from '../theme/palette';
import { useAudioStore } from '../hooks/useAudioStore';
import { gridTicks } from '../tempo/tempo';
import { getView, subscribeView } from './viewStore';

export default function GridLines() {
  const palette = useAppPalette();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempo = useAudioStore((s) => (s.rulerMode === 'bars' ? s.tempo : null));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || !tempo) return;
    const { pxPerSec, scrollLeft, viewportWidth } = getView();
    const width = Math.max(1, Math.floor(viewportWidth));
    const height = Math.max(1, parent.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.left = `${scrollLeft}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const barColor = alpha(palette.text, 0.14);
    const beatColor = alpha(palette.text, 0.05);
    for (const tick of gridTicks(scrollLeft / pxPerSec, (scrollLeft + width) / pxPerSec, pxPerSec, tempo)) {
      g.fillStyle = tick.bar !== undefined ? barColor : beatColor;
      g.fillRect(Math.round(tick.time * pxPerSec - scrollLeft), 0, 1, height);
    }
  }, [palette, tempo]);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!tempo || !parent) return;
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    const unsubscribe = subscribeView(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [draw, tempo]);

  if (!tempo) return null;
  return <canvas ref={canvasRef} data-grid-lines style={{ position: 'absolute', top: 0, pointerEvents: 'none' }} />;
}
