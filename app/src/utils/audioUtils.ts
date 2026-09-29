/**
 * Audio utilities for recording with time offset (padding)
 */

import {logger} from "./logger.ts";

/**
 * Normalize samples to maximize volume without clipping (in place)
 */
function normalizeSamples(samples: Float32Array) {
  let maxPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const absSample = Math.abs(samples[i]);
    if (absSample > maxPeak) {
      maxPeak = absSample;
    }
  }

  // Safety: if signal is too weak (< 2%), probably just noise - don't normalize
  const MIN_SIGNAL_THRESHOLD = 0.02; // 2% (avoids boosting noise by +34dB+)
  if (maxPeak < MIN_SIGNAL_THRESHOLD) {
    console.warn(`⚠️ Recording signal too weak (peak: ${(maxPeak * 100).toFixed(3)}%) - Normalization SKIPPED to avoid amplifying noise`);
    console.warn(`⚠️ Check your microphone level or gain settings`);
    return;
  }

  if (maxPeak >= 0.99) {
    logger.log(`🔊 No normalization needed (peak: ${(maxPeak * 100).toFixed(1)}%)`);
    return;
  }

  // Normalize to 0.95 (leave 5% headroom)
  const targetPeak = 0.95;
  const gain = targetPeak / maxPeak;
  logger.log(`🔊 Normalizing audio: peak ${(maxPeak * 100).toFixed(1)}% → ${(targetPeak * 100).toFixed(1)}% (gain: +${(20 * Math.log10(gain)).toFixed(1)} dB)`);
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= gain;
  }
}

/**
 * Encode a take as a stereo WAV clip placed on the timeline of the piece.
 *
 * `timelineOffset` is the position (seconds) in the piece of samples[0]. The
 * clip keeps only the recorded audio (no silence added before it); when the
 * latency compensation moves it before 0, its beginning is trimmed.
 */
export function buildTake(
  samples: Float32Array,
  sampleRate: number,
  timelineOffset: number
): { blob: Blob; clipOffset: number } {
  const trimSamples = timelineOffset < 0 ? Math.round(-timelineOffset * sampleRate) : 0;
  const clipOffset = Math.max(0, timelineOffset);

  const mono = samples.slice(Math.min(trimSamples, samples.length));
  normalizeSamples(mono);

  logger.log(`🎙️ Take: ${samples.length} samples @${sampleRate}Hz, clip at ${clipOffset.toFixed(4)}s (${trimSamples} samples trimmed)`);

  // Mono mic → both channels
  const blob = encodeWav([mono, mono], sampleRate);
  logger.log(`💾 Final output: ${blob.type}, ${(blob.size / 1024).toFixed(2)} KB`);
  return { blob, clipOffset };
}

/**
 * Encode channels to a 16-bit PCM WAV Blob
 */
function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numberOfChannels = channels.length;
  const frameCount = channels[0].length;
  const length = frameCount * numberOfChannels * 2; // 16-bit samples
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  logger.log(`💾 WAV encoding: ${numberOfChannels} channels, ${sampleRate}Hz, ${frameCount} samples`);

  // Helper to write string to DataView
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // WAV header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // ByteRate
  view.setUint16(32, numberOfChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Write audio data (interleaved)
  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = channels[channel][i];
      // Clamp to [-1, 1] and convert to 16-bit PCM
      const clampedSample = Math.max(-1, Math.min(1, sample));
      const int16Sample = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff;
      view.setInt16(offset, int16Sample, true);
      offset += 2;
    }
  }

  logger.log(`💾 WAV file created: ${arrayBuffer.byteLength} bytes`);

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Format time in seconds to MM:SS
 */
export function formatRecordingTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

