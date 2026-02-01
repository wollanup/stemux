import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';
import { useAudioStore, wavesurferInstances } from '../hooks/useAudioStore';
import { addSilencePadding, formatRecordingTime } from '../utils/audioUtils';
import { getBestRecordingConfig, logSupportedFormats } from '../utils/recordingConfig';
import { useTranslation } from 'react-i18next';
import type { AudioTrack } from '../types/audio';
import {logger} from "../utils/logger.ts";

interface RecordableWaveformProps {
  track: AudioTrack;
}

const RecordableWaveform = ({ track }: RecordableWaveformProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const recordPluginRef = useRef<RecordPlugin | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingStartTimeRef = useRef<number>(0); // Track ACTUAL start time
  
  const { 
    audioContext, 
    saveRecording, 
    stopRecording: stopRecordingStore,
    playbackState 
  } = useAudioStore();

  useEffect(() => {
    if (!containerRef.current || !track.isArmed) return;

    // Log supported formats on first mount
    logSupportedFormats();
    
    // Get recording config
    const recordingConfig = getBestRecordingConfig();

    // Create WaveSurfer for live recording display
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: track.color,
      progressColor: track.color + '80',
      height: 60,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });

    wavesurferRef.current = wavesurfer;

    // Create RecordPlugin with best quality settings
    const record = wavesurfer.registerPlugin(
      RecordPlugin.create({
        renderRecordedAudio: false,
        scrollingWaveform: false,
        continuousWaveform: true,
        continuousWaveformDuration: 300,
        audioBitsPerSecond: recordingConfig.audioBitsPerSecond,
        mimeType: recordingConfig.mimeType || undefined,
      })
    );

    recordPluginRef.current = record;

    // Handle recording START (precise timing)
    record.on('record-start', () => {
      // Get ACTUAL current time from a playing WaveSurfer instance (not this recording one)
      let actualStartTime = track.recordingStartOffset || 0; // fallback
      
      const playingInstances = Array.from(wavesurferInstances.values());
      if (playingInstances.length > 0) {
        // Use first playing instance for accurate time
        actualStartTime = playingInstances[0].getCurrentTime();
      }
      
      recordingStartTimeRef.current = actualStartTime;
      
      const expectedStartTime = track.recordingStartOffset || 0;
      const latency = actualStartTime - expectedStartTime;
      
      logger.log(`⏱️ Recording START:`);
      logger.log(`  - Expected start: ${expectedStartTime.toFixed(6)}s`);
      logger.log(`  - Actual start: ${actualStartTime.toFixed(6)}s`);
      logger.log(`  - Measured latency: ${(latency * 1000).toFixed(2)}ms`);
    });

    // Handle recording progress
    record.on('record-progress', (time) => {
      setRecordingTime(time);
    });

    // Handle recording end
    record.on('record-end', async (blob) => {
      if (!audioContext) return;

      try {
        // Calculate precise offset with half-latency compensation
        const expectedStartTime = track.recordingStartOffset || 0;
        const actualStartTime = recordingStartTimeRef.current;
        const latency = actualStartTime - expectedStartTime;
        
        // Use halfway point between expected and actual (empirical best result)
        const compensatedOffset = expectedStartTime + (latency / 2);
        
        logger.log(`⏱️ Recording END:`);
        logger.log(`  - Recorded blob: ${blob.type}, ${blob.size} bytes`);
        logger.log(`  - Expected offset: ${expectedStartTime.toFixed(6)}s`);
        logger.log(`  - Actual offset: ${actualStartTime.toFixed(6)}s`);
        logger.log(`  - Latency: ${(latency * 1000).toFixed(2)}ms`);
        logger.log(`  - Using COMPENSATED offset: ${compensatedOffset.toFixed(6)}s (halfway)`);
        
        // Apply silence padding with compensated offset
        const paddedBlob = await addSilencePadding(blob, compensatedOffset, audioContext);

        logger.log(`  - Padded blob size: ${paddedBlob.size} bytes`);

        // Save the padded recording
        await saveRecording(track.id, paddedBlob);

        setRecordingTime(0);
      } catch (error) {
        console.error('Failed to process recording:', error);
      }
    });

    // Auto-start recording when armed and playing
    if (track.recordingState === 'recording' && playbackState.isPlaying) {
      record.startRecording(recordingConfig.audioConstraints as any).catch((error: Error) => {
        console.error('Failed to start recording:', error);
        
        let errorMessage = t('recording.errors.unknown');
        let errorDetails = '';
        
        if (error.name === 'NotAllowedError') {
          errorMessage = t('recording.errors.permissionDenied');
          errorDetails = t('recording.errors.checkPermissions');
        } else if (error.name === 'NotFoundError') {
          errorMessage = t('recording.errors.noMicrophone');
        } else if (error.name === 'NotReadableError') {
          errorMessage = t('recording.errors.microphoneInUse');
        }
        
        const fullMessage = errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage;
        alert(fullMessage);
        stopRecordingStore(track.id);
      });
    }

    return () => {
      if (record.isRecording()) {
        record.stopRecording();
      }
      wavesurfer.destroy();
    };
  }, [track.isArmed, track.recordingState, playbackState.isPlaying]);

  // Stop recording when playback stops
  useEffect(() => {
    if (!playbackState.isPlaying && recordPluginRef.current?.isRecording()) {
      recordPluginRef.current.stopRecording();
    }
  }, [playbackState.isPlaying]);

  if (!track.isArmed) {
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

  // Track is armed - show ready message OR waveform
  if (track.recordingState === 'armed' && !playbackState.isPlaying) {
    // Not recording yet - show "Ready to record" message
    return (
      <Box
        sx={{
          height: 60,
          display: 'flex',
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
      </Box>
    );
  }

  // Recording in progress - show waveform
  return (
    <Box>
      <div ref={containerRef} />
      {track.recordingState === 'recording' && (
        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
          {formatRecordingTime(recordingTime)}
        </Typography>
      )}
    </Box>
  );
};

export default RecordableWaveform;
