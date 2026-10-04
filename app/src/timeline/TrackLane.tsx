/**
 * One track on the timeline: its clip drawn at its position, empty lane
 * elsewhere. Clicking the lane moves the playhead; dragging it with the mouse
 * scrolls the timeline, except on a clip in edit mode, where the clip is moved
 * (body) or trimmed (edges).
 */

import { useEffect, useRef, useState } from 'react';
import { alpha, Box, Typography, useTheme } from '@mui/material';
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
    <Box
      data-clip-edge={side}
      sx={{ position: 'absolute', top: 0, bottom: 0, [side === 'start' ? 'left' : 'right']: -1, width: 3, bgcolor: color }}
    />
  );
  return (
    <Box
      data-clip
      data-clip-start={geometry.offset}
      data-clip-duration={geometry.duration}
      data-clip-trim={geometry.trimStart}
      sx={{
        position: 'absolute',
        left: geometry.offset * pxPerSec,
        width: geometry.duration * pxPerSec,
        top: 0,
        bottom: 0,
        bgcolor: alpha(color, 0.12),
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
  const theme = useTheme();
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

  const waveColor = track.isMuted ? theme.palette.action.disabled : track.color;
  const recordStart = track.recordingStartOffset ?? 0;
  // Lane height minus its bottom separator; bars keep a margin of their own
  const drawHeight = height - 1;

  const renderWave = (source: PeakSource | null, sourceOffset: number, animate = false, bounds?: { start: number; end: number }) => (
    <Box sx={{ position: 'absolute', left: 0, right: 0, top: 0, height: drawHeight, opacity: dimmed ? 0.35 : 1 }}>
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
    </Box>
  );

  let hint: string | null = null;
  if (track.isRecordable && !track.file && !isRecording) {
    hint = track.isArmed ? t('recording.readyToRecord') : t('recording.armToRecord');
  }

  return (
    <Box
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
      sx={{
        position: 'relative',
        '@media (hover: hover)': {
          '&:hover [data-clip]': { borderColor: 'var(--clip-border)' },
        },
        width,
        height,
        flexShrink: 0,
        cursor: pan.panning ? 'grabbing' : (clipDrag.cursor ?? 'grab'),
        userSelect: 'none',
        bgcolor: track.isArmed ? alpha(theme.palette.error.main, 0.06) : 'transparent',
        borderBottom: `1px solid ${theme.palette.divider}`,
        outline: track.isArmed ? `1px dashed ${alpha(theme.palette.error.main, 0.6)}` : 'none',
        outlineOffset: -1,
      }}
    >
      {audio && shown && <Clip geometry={shown} pxPerSec={pxPerSec} color={track.color} activeEdge={clipDrag.zone} />}
      {audio && shown && renderWave(audio.pyramid, shown.offset - shown.trimStart, false, { start: shown.offset, end: shown.offset + shown.duration })}

      {isRecording && liveTake && (
        <>
          <Box
            ref={liveClipRef}
            sx={{
              position: 'absolute',
              left: recordStart * pxPerSec,
              top: 0,
              bottom: 0,
              width: 2,
              bgcolor: alpha(theme.palette.error.main, 0.14),
              border: `1px solid ${alpha(theme.palette.error.main, 0.6)}`,
              pointerEvents: 'none',
            }}
          />
          {renderWave(liveTake, recordStart, true)}
        </>
      )}

      {track.isLoading && !audio && (
        <Box sx={{ position: 'absolute', inset: 6, bgcolor: 'action.hover', borderRadius: 1 }} />
      )}

      {hint && (
        <Typography
          variant="caption"
          sx={{
            position: 'sticky',
            left: headerOffset + 12,
            display: 'inline-block',
            mt: `${height / 2 - 10}px`,
            color: track.isArmed ? 'error.main' : 'text.secondary',
            fontWeight: track.isArmed ? 600 : 400,
            pointerEvents: 'none',
          }}
        >
          {hint}
        </Typography>
      )}
    </Box>
  );
}
