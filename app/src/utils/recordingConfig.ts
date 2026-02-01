/**
 * Audio recording configuration utilities
 * Fixed high-quality settings for professional recording
 */
import {logger} from "./logger.ts";

export interface RecordingConfig {
  mimeType: string;
  audioBitsPerSecond: number;
  audioConstraints: MediaTrackConstraints;
}

/**
 * Get the best recording configuration for current browser
 * Always uses highest quality available (PCM lossless)
 */
export function getBestRecordingConfig(): RecordingConfig {
  // Try PCM lossless first
  let mimeType = '';
  
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
    mimeType = 'audio/webm;codecs=pcm';
  } else if (MediaRecorder.isTypeSupported('audio/wav')) {
    mimeType = 'audio/wav';
  } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    mimeType = 'audio/webm;codecs=opus';
  } else if (MediaRecorder.isTypeSupported('audio/webm')) {
    mimeType = 'audio/webm';
  }
  
  logger.log(`🎙️ Recording format: ${mimeType} @ 1536 kbps`);
  
  return {
    mimeType,
    audioBitsPerSecond: 1536000, // High quality
    audioConstraints: getHighQualityAudioConstraints(),
  };
}

/**
 * Get high-quality audio constraints for getUserMedia
 */
function getHighQualityAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: false,    // Disable for music/instruments (critical!)
    noiseSuppression: false,    // Disable for clean recording
    autoGainControl: false,     // Disable AGC for consistent levels (critical!)
    sampleRate: { ideal: 48000 }, // Professional quality (48kHz)
    channelCount: { ideal: 1 },   // Mono (we'll convert to stereo in post)
  };
}

/**
 * Log supported formats for debugging
 */
export function logSupportedFormats(): void {
  if (typeof MediaRecorder === 'undefined') {
    logger.log('❌ MediaRecorder not available');
    return;
  }

  const formats = [
    'audio/wav',
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/webm;codecs=pcm',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ];

  logger.log('🎙️ Supported recording formats:');
  formats.forEach(format => {
    const supported = MediaRecorder.isTypeSupported(format);
    logger.log(`  ${supported ? '✅' : '❌'} ${format}`);
  });
}
