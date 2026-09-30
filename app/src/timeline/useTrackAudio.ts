/**
 * Decodes a track's audio into the shared engine (placed at its clip offset)
 * and prepares its waveform peaks.
 */

import { useEffect, useRef, useState } from 'react';
import { audioEngine, type ClipWindow } from '../audio/AudioEngine';
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

/** Clip window of a track (the file itself is never modified) */
export const clipOf = (track: AudioTrack): ClipWindow => ({
  offset: track.clipOffset ?? 0,
  trimStart: track.trimStart ?? 0,
  duration: track.clipDuration,
});

export function useTrackAudio(track: AudioTrack) {
  const [loaded, setLoaded] = useState<{ pyramid: PeakPyramid; duration: number } | null>(null);
  const source = track.recordedBlob || track.file;
  const { offset, trimStart, duration } = clipOf(track);
  // Latest clip window, read when the decoding finishes
  const clipRef = useRef<ClipWindow>({ offset, trimStart, duration });
  useEffect(() => {
    clipRef.current = { offset, trimStart, duration };
  }, [offset, trimStart, duration]);

  // Decode once per file
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    audioEngine
      .decode(source)
      .then((buffer) => {
        if (cancelled) return;
        audioEngine.addTrack(track.id, buffer, clipRef.current);
        setLoaded({ pyramid: getPyramid(buffer), duration: buffer.duration });
      })
      .catch((error) => console.error('Failed to decode audio for track', track.id, error));

    return () => {
      cancelled = true;
      audioEngine.removeTrack(track.id);
      setLoaded(null);
    };
  }, [source, track.id]);

  // Clip moved / trimmed: update the engine in place (no reload)
  useEffect(() => {
    audioEngine.setClip(track.id, { offset, trimStart, duration });
  }, [track.id, offset, trimStart, duration]);

  return loaded;
}
