import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { audioEngine } from '../audio/AudioEngine';
import { getMic, subscribeMic } from '../audio/micSession';
import type { MicRecorder } from '../audio/MicRecorder';
import { formatRecordingTime } from '../utils/audioUtils';
import type { AudioTrack } from '../types/audio';

interface RecordableWaveformProps {
  track: AudioTrack;
}

/** Samples per drawn bar */
const BAR_SAMPLES = 1024;

const useMic = () => {
  const [recorder, setRecorder] = useState<MicRecorder | null>(getMic);
  useEffect(() => subscribeMic(setRecorder), []);
  return recorder;
};

/** Input level meter, visible as soon as the track is armed */
const LevelMeter = ({ recorder }: { recorder: MicRecorder | null }) => {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!recorder) return;
    return recorder.onLevel(setLevel);
  }, [recorder]);

  const db = level > 0 ? 20 * Math.log10(level) : -60;
  const percent = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  const color = level > 0.9 ? 'error.main' : level > 0.5 ? 'warning.main' : 'success.main';

  return (
    <Box sx={{ width: '60%', height: 6, bgcolor: 'action.selected', borderRadius: 3, overflow: 'hidden', mt: 0.5 }}>
      <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: color, transition: 'width 50ms linear' }} />
    </Box>
  );
};

const RecordableWaveform = ({ track }: RecordableWaveformProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorder = useMic();
  const isPlaying = useAudioStore((state) => state.playbackState.isPlaying);
  const isRecording = track.recordingState === 'recording';

  // Live waveform, drawn at its position on the piece timeline
  useEffect(() => {
    if (!isRecording || !recorder) return;

    const startOffset = track.recordingStartOffset ?? 0;
    const peaks: number[] = [];
    let sampleRate = 48000;
    let current = 0;
    let currentCount = 0;
    let recorded = 0;
    let shownSeconds = -1;
    let raf = 0;

    const unsubscribe = recorder.onData((_frame, samples) => {
      sampleRate = audioEngine.getContext().sampleRate;
      for (let i = 0; i < samples.length; i++) {
        const v = Math.abs(samples[i]);
        if (v > current) current = v;
        if (++currentCount === BAR_SAMPLES) {
          peaks.push(current);
          current = 0;
          currentCount = 0;
        }
      }
      recorded += samples.length;
    });

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * devicePixelRatio) {
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
      }
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      g.clearRect(0, 0, width, height);

      const recordedSeconds = recorded / sampleRate;
      const total = Math.max(audioEngine.getDuration(), startOffset + recordedSeconds, 1);
      const pxPerSecond = width / total;
      const barSeconds = BAR_SAMPLES / sampleRate;
      g.fillStyle = track.color;
      for (let i = 0; i < peaks.length; i++) {
        const x = (startOffset + i * barSeconds) * pxPerSecond;
        const h = Math.max(1, peaks[i] * height);
        g.fillRect(x, (height - h) / 2, Math.max(1, barSeconds * pxPerSecond), h);
      }
      if (Math.floor(recordedSeconds) !== shownSeconds) {
        shownSeconds = Math.floor(recordedSeconds);
        setRecordingTime(shownSeconds * 1000);
      }
    };
    draw();

    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      setRecordingTime(0);
    };
  }, [isRecording, recorder, track.recordingStartOffset, track.color]);

  if (!track.isArmed && !isRecording) {
    return (
      <Box
        sx={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
          bgcolor: 'action.hover',
          borderRadius: 1,
          border: '1px dashed',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption">
          {t('recording.armToRecord')}
        </Typography>
      </Box>
    );
  }

  if (!isRecording && !isPlaying) {
    // Armed, not recording yet: "Ready to record" + input level
    return (
      <Box
        sx={{
          height: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'error.main',
          bgcolor: 'rgba(244, 67, 54, 0.05)',
          borderRadius: 1,
          border: '1px dashed',
          borderColor: 'error.main',
        }}
      >
        <Typography variant="caption" fontWeight={600}>
          {t('recording.readyToRecord')}
        </Typography>
        <LevelMeter recorder={recorder} />
      </Box>
    );
  }

  // Recording in progress
  return (
    <Box>
      <canvas ref={canvasRef} style={{ width: '100%', height: 60, display: 'block' }} />
      {isRecording && (
        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
          {formatRecordingTime(recordingTime)}
        </Typography>
      )}
    </Box>
  );
};

export default RecordableWaveform;
