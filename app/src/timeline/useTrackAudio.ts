/**
 * Decodes a track's audio into the shared engine (placed at its clip offset)
 * and prepares its waveform peaks.
 */

import { useEffect, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { PeakPyramid } from './peaks';
import type { AudioTrack } from '../types/audio';

const pyramids = new WeakMap<AudioBuffer, PeakPyramid>();

const getPyramid = (buffer: AudioBuffer) => {
  let pyramid = pyramids.get(buffer);
  if (!pyramid) {
    pyramid = PeakPyramid.fromAudioBuffer(buffer);
    pyramids.set(buffer, pyramid);
  }
  return pyramid;
};

export function useTrackAudio(track: AudioTrack) {
  const [loaded, setLoaded] = useState<{ pyramid: PeakPyramid; duration: number } | null>(null);
  const source = track.recordedBlob || track.file;
  const offset = track.clipOffset ?? 0;

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    audioEngine
      .decode(source)
      .then((buffer) => {
        if (cancelled) return;
        audioEngine.addTrack(track.id, buffer, offset);
        setLoaded({ pyramid: getPyramid(buffer), duration: buffer.duration });
      })
      .catch((error) => console.error('Failed to decode audio for track', track.id, error));

    return () => {
      cancelled = true;
      audioEngine.removeTrack(track.id);
      setLoaded(null);
    };
  }, [source, track.id, offset]);

  return loaded;
}
