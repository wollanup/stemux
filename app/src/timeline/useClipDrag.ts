/**
 * Mouse editing of a clip in its lane:
 * - edges: trim (horizontal arrow cursor, thicker border)
 * - body: move (move cursor; the hand is for scrolling)
 * - click without moving: seek, like anywhere on the lane
 * Only in edit mode. Touch keeps scrolling the timeline (no clip editing yet).
 */

import { useRef, useState } from 'react';
import { useAudioStore } from '../hooks/useAudioStore';
import { audioEngine } from '../audio/AudioEngine';
import { clipZone, editClip, sameGeometry, type ClipGeometry, type ClipZone } from './clipEdit';
import { snapTargets, snapThreshold } from './snapping';
import { setSnapGuide } from './snapGuide';
import { gridTargets } from './gridSnap';

/** Pointer movement before a press becomes a drag (px) */
const DRAG_START_PX = 3;

interface Drag {
  pointerId: number;
  zone: ClipZone;
  startX: number;
  original: ClipGeometry;
  started: boolean;
}

interface Options {
  trackId: string;
  geometry: ClipGeometry | null;
  sourceDuration: number;
  pxPerSec: number;
  /** Editing disabled (recording, loading...) */
  disabled: boolean;
}

const laneX = (e: React.PointerEvent<HTMLElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

export function useClipDrag({ trackId, geometry, sourceDuration, pxPerSec, disabled }: Options) {
  const [hoverZone, setHoverZone] = useState<ClipZone | null>(null);
  const [preview, setPreviewState] = useState<ClipGeometry | null>(null);
  const previewRef = useRef<ClipGeometry | null>(null);
  const setPreview = (clip: ClipGeometry | null) => {
    previewRef.current = clip;
    setPreviewState(clip);
  };
  const [dragZone, setDragZone] = useState<ClipZone | null>(null);
  const drag = useRef<Drag | null>(null);
  /** The last click was the end of a mouse gesture, already handled */
  const clickHandled = useRef(false);

  const zoneAt = (x: number): ClipZone | null => {
    if (!geometry || disabled) return null;
    return clipZone(x - geometry.offset * pxPerSec, geometry.duration * pxPerSec);
  };

  const isMouse = (e: React.PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';

  /** Returns true when the press grabbed the clip */
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!isMouse(e) || e.button !== 0 || !geometry) return false;
    const zone = zoneAt(laneX(e));
    if (!zone) return false;
    // No text selection nor native drag & drop (they would cancel the gesture)
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, zone, startX: laneX(e), original: geometry, started: false };
    return true;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isMouse(e)) return;
    const x = laneX(e);
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) {
      const zone = zoneAt(x);
      if (zone !== hoverZone) setHoverZone(zone);
      return;
    }
    if (!current.started) {
      if (Math.abs(x - current.startX) < DRAG_START_PX) return;
      current.started = true;
      setDragZone(current.zone);
    }

    const state = useAudioStore.getState();
    // Alt: no magnetism for this move
    const snap = state.snapEnabled && !e.altKey;
    const result = editClip(current.zone, current.original, (x - current.startX) / pxPerSec, {
      sourceDuration,
      targets: snap
        ? snapTargets({
            markers: state.loopState.markers,
            playhead: audioEngine.getCurrentTime(),
            clipEdges: audioEngine.getClipEdges(trackId),
            grid: gridTargets(0, state.playbackState.duration + sourceDuration, pxPerSec),
          })
        : [],
      snapThreshold: snapThreshold(pxPerSec),
    });
    setPreview(result.clip);
    setSnapGuide(result.snappedTo);
  };

  const finish = (commit: boolean) => {
    const current = drag.current;
    drag.current = null;
    setSnapGuide(null);
    setDragZone(null);
    const edited = previewRef.current;
    if (commit && current?.started && edited && !sameGeometry(edited, current.original)) {
      useAudioStore.getState().updateClip(trackId, edited);
    }
    setPreview(null);
    return current;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) return;
    finish(true);
    if (current.started) {
      // A drag is not a click: do not move the playhead
      clickHandled.current = true;
    }
  };

  const onPointerCancel = () => {
    if (drag.current) finish(false);
  };

  /** To call from the lane click handler: true when the click must be ignored */
  const consumeClick = () => {
    const handled = clickHandled.current;
    clickHandled.current = false;
    return handled;
  };

  const zone = dragZone ?? hoverZone;
  const cursor = zone === 'body' ? 'move' : zone ? 'ew-resize' : null;

  return {
    /** Geometry to draw (the preview while dragging) */
    shown: preview ?? geometry,
    zone,
    cursor,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave: () => !drag.current && setHoverZone(null) },
    consumeClick,
  };
}
