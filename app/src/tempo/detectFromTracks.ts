/**
 * Tempo detection on the tracks of the piece: the audible ones (a muted
 * vocal track does not blur the drums), placed where their clips are.
 */

import { audioEngine } from '../audio/AudioEngine';
import { useAudioStore } from '../hooks/useAudioStore';
import { clipOf } from '../timeline/useTrackAudio';
import { detectTempo, onsetEnvelope, type DetectedTempo, type DetectSource } from './detectTempo';

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function detectPieceTempo(beatsPerBar: number): Promise<DetectedTempo | null> {
  const { tracks } = useAudioStore.getState();
  const hasSolo = tracks.some((t) => t.isSolo);
  const sources: DetectSource[] = [];
  for (const track of tracks) {
    if (track.isMuted || (hasSolo && !track.isSolo)) continue;
    const buffer = audioEngine.getTrackBuffer(track.id);
    if (!buffer) continue;
    const clip = clipOf(track);
    sources.push({ buffer, offset: clip.offset, trimStart: clip.trimStart, duration: clip.duration ?? buffer.duration - clip.trimStart });
    // One track at a time, letting the page breathe in between (analysis is cached)
    onsetEnvelope(buffer);
    await nextFrame();
  }
  return sources.length > 0 ? detectTempo(sources, beatsPerBar) : null;
}
