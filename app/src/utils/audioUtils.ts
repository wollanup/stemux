/**
 * Audio utilities for recording with time offset (padding)
 */

/**
 * Normalize audio buffer to maximize volume without clipping
 * Finds the peak and scales the entire buffer to use full range
 */
function normalizeAudioBuffer(buffer: AudioBuffer, audioContext: AudioContext): AudioBuffer {
  let maxPeak = 0;

  console.log(`🔊 Normalize input: ${buffer.numberOfChannels} channels`);

  // Find the absolute maximum across all channels
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const absSample = Math.abs(data[i]);
      if (absSample > maxPeak) {
        maxPeak = absSample;
      }
    }
  }

  // If already at max or silent, return as-is
  if (maxPeak === 0 || maxPeak >= 0.99) {
    console.log(`🔊 No normalization needed (peak: ${(maxPeak * 100).toFixed(1)}%)`);
    return buffer;
  }

  // Calculate gain to normalize to 0.95 (leave 5% headroom)
  const targetPeak = 0.95;
  const gain = targetPeak / maxPeak;

  console.log(`🔊 Normalizing audio: peak ${(maxPeak * 100).toFixed(1)}% → ${(targetPeak * 100).toFixed(1)}% (gain: +${(20 * Math.log10(gain)).toFixed(1)} dB)`);

  // Create new buffer with normalized data (preserve channel count!)
  const normalizedBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  console.log(`🔊 Normalize output: ${normalizedBuffer.numberOfChannels} channels`);

  // Apply gain to all channels
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = normalizedBuffer.getChannelData(channel);
    
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[i] * gain;
    }
  }

  return normalizedBuffer;
}

/**
 * Add silence padding to the beginning of an audio blob
 * This aligns the recording to the correct position in the timeline
 * Also converts mono to stereo and normalizes volume
 */
export async function addSilencePadding(
  audioBlob: Blob,
  offsetSeconds: number,
  audioContext: AudioContext
): Promise<Blob> {
  console.log(`🎙️ Processing recording, original format: ${audioBlob.type}`);
  
  // 1. Decode the recorded audio
  const arrayBuffer = await audioBlob.arrayBuffer();
  let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  console.log(`🎙️ Input: ${audioBuffer.numberOfChannels} channel(s), ${audioBuffer.sampleRate}Hz, ${audioBuffer.length} samples`);

  // 2. Normalize volume to maximize loudness
  audioBuffer = normalizeAudioBuffer(audioBuffer, audioContext);

  // 3. Apply latency compensation
  const LATENCY_COMPENSATION_MS = 0; // milliseconds
  const compensatedOffset = offsetSeconds + (LATENCY_COMPENSATION_MS / 1000); // ADD delay
  
  console.log(`⏱️ Offset compensation: ${offsetSeconds.toFixed(4)}s + ${LATENCY_COMPENSATION_MS}ms = ${compensatedOffset.toFixed(4)}s`);

  // 4. Calculate padding samples
  const sampleRate = audioBuffer.sampleRate;
  const paddingSamples = compensatedOffset > 0 ? Math.floor(compensatedOffset * sampleRate) : 0;
  const totalSamples = paddingSamples + audioBuffer.length;

  // 4. Force stereo output (always 2 channels)
  const outputChannels = 2;
  const isMono = audioBuffer.numberOfChannels === 1;

  // 5. Create new buffer with padding (always stereo output)
  const paddedBuffer = audioContext.createBuffer(
    outputChannels,
    totalSamples,
    sampleRate
  );

  // 6. Copy data: silence (zeros) + original audio
  if (isMono) {
    // Mono to stereo: duplicate channel to both L and R
    const originalData = audioBuffer.getChannelData(0);
    const leftData = paddedBuffer.getChannelData(0);
    const rightData = paddedBuffer.getChannelData(1);
    
    leftData.set(originalData, paddingSamples);
    rightData.set(originalData, paddingSamples);
    
    console.log('🎙️ Mono → Stereo (duplicated)');
  } else if (audioBuffer.numberOfChannels === 2) {
    // Always duplicate LEFT channel to both sides (mic mono on stereo interface)
    const leftDataIn = audioBuffer.getChannelData(0);
    const leftDataOut = paddedBuffer.getChannelData(0);
    const rightDataOut = paddedBuffer.getChannelData(1);
    
    leftDataOut.set(leftDataIn, paddingSamples);
    rightDataOut.set(leftDataIn, paddingSamples); // Copy LEFT to RIGHT
    
    console.log('🎙️ Stereo input → Forced L=R duplication');
  } else {
    // Multi-channel: mix down to stereo
    console.log(`🎙️ Multi-channel (${audioBuffer.numberOfChannels}), mixing to stereo`);
    const leftData = paddedBuffer.getChannelData(0);
    const rightData = paddedBuffer.getChannelData(1);
    
    // Mix all channels to stereo
    for (let i = 0; i < audioBuffer.length; i++) {
      let leftSum = 0;
      let rightSum = 0;
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const sample = audioBuffer.getChannelData(ch)[i];
        if (ch % 2 === 0) {
          leftSum += sample;
        } else {
          rightSum += sample;
        }
      }
      leftData[paddingSamples + i] = leftSum / Math.ceil(audioBuffer.numberOfChannels / 2);
      rightData[paddingSamples + i] = rightSum / Math.floor(audioBuffer.numberOfChannels / 2);
    }
  }

  console.log(`🎙️ Output: 2 channels (stereo), ${paddedBuffer.sampleRate}Hz, ${paddedBuffer.length} samples`);

  // 7. Convert padded buffer to WAV blob (always WAV for high quality, or if we need padding)
  // For low/medium quality without padding, we could keep original format, but for simplicity
  // we always encode to WAV to ensure consistency (padding, normalization, stereo conversion)
  const finalBlob = audioBufferToWavBlob(paddedBuffer);
  console.log(`💾 Final output: ${finalBlob.type}, ${(finalBlob.size / 1024).toFixed(2)} KB`);
  
  return finalBlob;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels * 2; // 16-bit samples
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  console.log(`💾 WAV encoding: ${numberOfChannels} channels, ${buffer.sampleRate}Hz, ${buffer.length} samples`);

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
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true); // ByteRate
  view.setUint16(32, numberOfChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Write audio data (interleaved)
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Clamp to [-1, 1] and convert to 16-bit PCM
      const clampedSample = Math.max(-1, Math.min(1, sample));
      const int16Sample = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff;
      view.setInt16(offset, int16Sample, true);
      offset += 2;
    }
  }

  console.log(`💾 WAV file created: ${arrayBuffer.byteLength} bytes`);

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
