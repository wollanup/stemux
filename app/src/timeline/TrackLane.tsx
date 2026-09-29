/**
 * One track on the timeline: its clip drawn at its position, empty lane
 * elsewhere. Clicking the lane moves the playhead.
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
import type { useTrackAudio } from './useTrackAudio';

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

function Clip({ left, width, color, name }: { left: number; width: number; color: string; name: string }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        left,
        width,
        top: 3,
        bottom: 3,
        bgcolor: alpha(color, 0.14),
        border: `1px solid ${alpha(color, 0.55)}`,
        borderRadius: 1,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <Typography
        variant="caption"
        noWrap
        sx={{ position: 'absolute', top: 1, left: 6, right: 6, fontSize: 10, lineHeight: 1.4, color: alpha(color, 0.9) }}
      >
        {name}
      </Typography>
    </Box>
  );
}

export default function TrackLane({ track, audio, width, height, pxPerSec, dimmed, headerOffset }: TrackLaneProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { seek, waveformStyle, waveformNormalize } = useAudioStore();
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

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, (e.clientX - rect.left) / pxPerSec));
  };

  const waveColor = track.isMuted ? theme.palette.action.disabled : track.color;
  const offset = track.clipOffset ?? 0;
  const recordStart = track.recordingStartOffset ?? 0;
  const drawHeight = height - 14;

  const renderWave = (source: PeakSource | null, sourceOffset: number, animate = false) => (
    <Box sx={{ position: 'absolute', left: 0, right: 0, top: 11, height: drawHeight, opacity: dimmed ? 0.35 : 1 }}>
      <WaveformCanvas
        source={source}
        offset={sourceOffset}
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
      sx={{
        position: 'relative',
        width,
        height,
        flexShrink: 0,
        cursor: 'pointer',
        bgcolor: track.isArmed ? alpha(theme.palette.error.main, 0.06) : 'transparent',
        borderBottom: `1px solid ${theme.palette.divider}`,
        outline: track.isArmed ? `1px dashed ${alpha(theme.palette.error.main, 0.6)}` : 'none',
        outlineOffset: -1,
      }}
    >
      {audio && (
        <Clip left={offset * pxPerSec} width={audio.duration * pxPerSec} color={track.color} name={track.name} />
      )}
      {audio && renderWave(audio.pyramid, offset)}

      {isRecording && liveTake && (
        <>
          <Box
            ref={liveClipRef}
            sx={{
              position: 'absolute',
              left: recordStart * pxPerSec,
              top: 3,
              bottom: 3,
              width: 2,
              bgcolor: alpha(theme.palette.error.main, 0.14),
              border: `1px solid ${alpha(theme.palette.error.main, 0.6)}`,
              borderRadius: 1,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <Typography variant="caption" noWrap sx={{ px: 0.75, fontSize: 10, color: 'error.main' }}>
              {t('recording.recording')}
            </Typography>
          </Box>
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
