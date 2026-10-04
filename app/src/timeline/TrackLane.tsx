/**
 * One track on the timeline: its clip drawn at its position, empty lane
 * elsewhere. Clicking the lane moves the playhead; dragging it with the mouse
 * scrolls the timeline, except on a clip in edit mode, where the clip is moved
 * (body) or trimmed (edges).
 */

import { useEffect, useRef, useState } from 'react';
import { alpha, Box, Text } from '@mantine/core';
import { useAppPalette } from '../theme/palette';
import classes from './TrackLane.module.css';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { audioEngine } from '../audio/AudioEngine';
import { getMic, subscribeMic } from '../audio/micSession';
import type { AudioTrack } from '../types/audio';
import WaveformCanvas from './WaveformCanvas';
import { LivePeaks, type PeakSource } from './peaks';
import { getView } from './viewStore';
import { clipOf, type useTrackAudio } from './useTrackAudio';
import { useClipDrag } from './useClipDrag';
import { useLanePan } from './useLanePan';
import type { ClipGeometry, ClipZone } from './clipEdit';

interface TrackLaneProps {
  track: AudioTrack;
  audio: ReturnType<typeof useTrackAudio>;
  width: number;
  height: number;
  pxPerSec: number;
  dimmed: boolean;
  headerOffset: number;
}

/** Take being recorded: peaks growing from the mic */
function useLiveTake(recording: boolean) {
  const [take, setTake] = useState<LivePeaks | null>(null);
  useEffect(() => {
    if (!recording) return;
    let unsubscribe: (() => void) | null = null;
    const attach = () => {
      const mic = getMic();
      if (!mic || unsubscribe) return;
      const peaks = new LivePeaks(audioEngine.getContext().sampleRate);
      setTake(peaks);
      unsubscribe = mic.onData((_frame, samples) => peaks.push(samples));
    };
    attach();
    const unsubscribeMic = subscribeMic(attach);
    return () => {
      unsubscribe?.();
      unsubscribeMic();
      setTake(null);
    };
  }, [recording]);
  return take;
}

/**
 * Extent of a clip: a light tint, no name (it is in the track header) and no
 * border, except while hovering the lane, to see exactly where it starts/ends.
 * The edge under the mouse gets a thick border: it can be dragged to trim.
 */
function Clip({ geometry, pxPerSec, color, activeEdge }: { geometry: ClipGeometry; pxPerSec: number; color: string; activeEdge: ClipZone | null }) {
  const edge = (side: 'start' | 'end') => (
    <div
      data-clip-edge={side}
      style={{ position: 'absolute', top: 0, bottom: 0, [side === 'start' ? 'left' : 'right']: -1, width: 3, backgroundColor: color }}
    />
  );
  return (
    <Box
      data-clip
      data-clip-start={geometry.offset}
      data-clip-duration={geometry.duration}
      data-clip-trim={geometry.trimStart}
      style={{
        position: 'absolute',
        left: geometry.offset * pxPerSec,
        width: geometry.duration * pxPerSec,
        top: 0,
        bottom: 0,
        backgroundColor: alpha(color, 0.12),
        border: '1px solid transparent',
        borderColor: activeEdge === 'body' ? alpha(color, 0.6) : 'transparent',
        '--clip-border': alpha(color, 0.6),
        pointerEvents: 'none',
        transition: 'border-color 0.15s',
      }}
    >
      {activeEdge === 'start' && edge('start')}
      {activeEdge === 'end' && edge('end')}
    </Box>
  );
}

export default function TrackLane({ track, audio, width, height, pxPerSec, dimmed, headerOffset }: TrackLaneProps) {
  const { t } = useTranslation();
  const palette = useAppPalette();
  const { seek, waveformStyle, waveformNormalize } = useAudioStore();
  const editMode = useAudioStore((s) => s.editMode);
  const isRecording = track.recordingState === 'recording';
  const liveTake = useLiveTake(isRecording);
  const liveClipRef = useRef<HTMLDivElement>(null);

  // Grow the live clip while recording
  useEffect(() => {
    if (!isRecording || !liveTake) return;
    let raf = 0;
    const loop = () => {
      if (liveClipRef.current) {
        const seconds = liveTake.length / liveTake.sampleRate;
        liveClipRef.current.style.width = `${Math.max(2, seconds * getView().pxPerSec)}px`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isRecording, liveTake]);

  // Clip window: where it is and which part of the file it plays
  const window = clipOf(track);
  const geometry: ClipGeometry | null = audio
    ? { offset: window.offset, trimStart: window.trimStart, duration: window.duration ?? audio.duration - window.trimStart }
    : null;
  const clipDrag = useClipDrag({
    trackId: track.id,
    geometry,
    sourceDuration: audio?.duration ?? 0,
    pxPerSec,
    disabled: !editMode || isRecording || track.isArmed === true,
  });
  const pan = useLanePan();
  const shown = clipDrag.shown;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Both are asked: each forgets its own gesture
    const dragged = clipDrag.consumeClick();
    if (pan.consumeClick() || dragged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, (e.clientX - rect.left) / pxPerSec));
  };

  const waveColor = track.isMuted ? palette.disabled : track.color;
  const recordStart = track.recordingStartOffset ?? 0;
  // Lane height minus its bottom separator; bars keep a margin of their own
  const drawHeight = height - 1;

  const renderWave = (source: PeakSource | null, sourceOffset: number, animate = false, bounds?: { start: number; end: number }) => (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: drawHeight, opacity: dimmed ? 0.35 : 1 }}>
      <WaveformCanvas
        source={source}
        offset={sourceOffset}
        clipStart={bounds?.start}
        clipEnd={bounds?.end}
        color={waveColor}
        height={drawHeight}
        barStyle={waveformStyle}
        normalize={waveformNormalize}
        animate={animate}
      />
    </div>
  );

  let hint: string | null = null;
  if (track.isRecordable && !track.file && !isRecording) {
    hint = track.isArmed ? t('recording.readyToRecord') : t('recording.armToRecord');
  }

  return (
    <div
      className={track.isArmed ? `${classes.lane} ${classes.armed}` : classes.lane}
      onClick={handleClick}
      onPointerDown={(e) => {
        if (!clipDrag.handlers.onPointerDown(e)) pan.handlers.onPointerDown(e);
      }}
      onPointerMove={(e) => {
        clipDrag.handlers.onPointerMove(e);
        pan.handlers.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        clipDrag.handlers.onPointerUp(e);
        pan.handlers.onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        clipDrag.handlers.onPointerCancel();
        pan.handlers.onPointerCancel(e);
      }}
      onPointerLeave={clipDrag.handlers.onPointerLeave}
      style={{ width, height, cursor: pan.panning ? 'grabbing' : (clipDrag.cursor ?? 'grab') }}
    >
      {audio && shown && <Clip geometry={shown} pxPerSec={pxPerSec} color={track.color} activeEdge={clipDrag.zone} />}
      {audio && shown && renderWave(audio.pyramid, shown.offset - shown.trimStart, false, { start: shown.offset, end: shown.offset + shown.duration })}

      {isRecording && liveTake && (
        <>
          <div
            ref={liveClipRef}
            style={{
              position: 'absolute',
              left: recordStart * pxPerSec,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: 'color-mix(in srgb, var(--app-error) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--app-error) 60%, transparent)',
              pointerEvents: 'none',
            }}
          />
          {renderWave(liveTake, recordStart, true)}
        </>
      )}

      {track.isLoading && !audio && (
        <div style={{ position: 'absolute', inset: 6, backgroundColor: 'var(--app-hover)', borderRadius: 4 }} />
      )}

      {hint && (
        <Text
          span
          size="xs"
          fw={track.isArmed ? 600 : 400}
          style={{
            position: 'sticky',
            left: headerOffset + 12,
            display: 'inline-block',
            marginTop: height / 2 - 10,
            color: track.isArmed ? 'var(--app-error)' : 'var(--app-text-secondary)',
            pointerEvents: 'none',
          }}
        >
          {hint}
        </Text>
      )}
    </div>
  );
}
