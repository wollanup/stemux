/**
 * Zoom commands shared by the top bar buttons and the timeline gestures
 */

import { useAudioStore } from '../hooks/useAudioStore';
import { pxPerSecond } from './timelineMath';
import { getView, setZoomAnchor } from './viewStore';
import { zoomInFrom, zoomOutFrom } from './zoom';

/** One preset step in (1) or out (-1), optionally around a given point */
export function zoomBy(direction: 1 | -1, anchor?: { time: number; viewportX: number }) {
  const { pxPerSec, viewportWidth } = getView();
  const duration = useAudioStore.getState().playbackState.duration;
  const fit = pxPerSecond(0, viewportWidth, duration);
  const next = direction > 0 ? zoomInFrom(pxPerSec) : zoomOutFrom(pxPerSec, fit);
  if (anchor) setZoomAnchor(anchor);
  useAudioStore.setState({ zoomLevel: next });
}
