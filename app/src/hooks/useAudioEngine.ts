import {useEffect, useRef} from 'react';
import {useAudioStore} from './useAudioStore';

// Convert AudioBuffer to WAV Blob
function bufferToWave(audioBuffer: AudioBuffer, len: number): Blob {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let offset = 0;
  let pos = 0;

  // Write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Write interleaved data
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      const sample = Math.max(-1, Math.min(1, channels[i][offset]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }
    offset++;
  }

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

interface AudioNodeRefs {
  [trackId: string]: {
    audioElement: HTMLAudioElement | null;
    sourceNode: MediaElementAudioSourceNode | null;
    gainNode: GainNode;
  };
}

export const useAudioEngine = () => {
  const audioNodesRef = useRef<AudioNodeRefs>({});
  const animationFrameRef = useRef<number | undefined>(undefined);
  const isPlayingRef = useRef(false);
  const playbackRateRef = useRef(1.0);
  const lastUpdateTimeRef = useRef<number>(0);
  const loopRegionRef = useRef({ enabled: false, start: 0, end: 0 });
  const isTransitioningRef = useRef(false); // Lock for play/pause transitions

  const {
    tracks,
    playbackState,
    loopRegion,
    audioContext,
    seek,
    pause,
    initAudioContext,
    masterVolume,
  } = useAudioStore();

  // Update loop region ref when it changes
  useEffect(() => {
    loopRegionRef.current = loopRegion;
  }, [loopRegion]);

  useEffect(() => {
    if (!audioContext) {
      initAudioContext();
    }
  }, [audioContext, initAudioContext]);

  // Initialize audio elements and gain nodes for each track
  useEffect(() => {
    if (!audioContext) return;

    tracks.forEach((track) => {
      if (!audioNodesRef.current[track.id] && track.buffer) {
        // Create audio element from buffer
        const audioElement = new Audio();
        audioElement.preservesPitch = true;
        (audioElement as any).mozPreservesPitch = true; // Firefox
        (audioElement as any).webkitPreservesPitch = true; // Safari
        audioElement.preload = 'auto';
        audioElement.playbackRate = playbackRateRef.current;

        // Protect against browser extensions that override playback rate
        audioElement.addEventListener('ratechange', () => {
          // If playbackRate was changed externally (by browser extension), restore it
          if (Math.abs(audioElement.playbackRate - playbackRateRef.current) > 0.01) {
            audioElement.playbackRate = playbackRateRef.current;
          }
        });

        // Convert AudioBuffer to blob and set as source
        const blob = bufferToWave(track.buffer, track.buffer.length);
        audioElement.src = URL.createObjectURL(blob);

        const gainNode = audioContext.createGain();
        const sourceNode = audioContext.createMediaElementSource(audioElement);
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Load the audio
        audioElement.load();

        audioNodesRef.current[track.id] = {
          audioElement,
          sourceNode,
          gainNode,
        };
      }
    });

    // Cleanup removed tracks
    Object.keys(audioNodesRef.current).forEach((id) => {
      if (!tracks.find((t) => t.id === id)) {
        const node = audioNodesRef.current[id];
        if (node.audioElement) {
          URL.revokeObjectURL(node.audioElement.src);
          node.audioElement.pause();
          node.audioElement.src = '';
        }
        if (node.sourceNode) {
          node.sourceNode.disconnect();
        }
        node.gainNode.disconnect();
        delete audioNodesRef.current[id];
      }
    });
  }, [tracks, audioContext]);

  // Update gain values
  useEffect(() => {
    tracks.forEach((track) => {
      const node = audioNodesRef.current[track.id];
      if (node) {
        const hasSolo = tracks.some((t) => t.isSolo);
        let volume = track.volume;

        if (track.isMuted || (hasSolo && !track.isSolo)) {
          volume = 0;
        }

        // Apply master volume
        node.gainNode.gain.value = volume * masterVolume;
      }
    });
  }, [tracks, masterVolume]);

  const startPlayback = async () => {
    if (!audioContext || isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    try {
      // Resume AudioContext if suspended (required after user interaction)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Stop any existing playback
      stopPlayback();

      let startTime = playbackState.currentTime;

      // If loop is enabled and current time is outside loop region, start from loop start
      if (loopRegionRef.current.enabled && loopRegionRef.current.end > loopRegionRef.current.start) {
        if (startTime < loopRegionRef.current.start || startTime >= loopRegionRef.current.end) {
          startTime = loopRegionRef.current.start;
          seek(loopRegionRef.current.start);
        }
      }

      // Play all tracks and collect promises
      const playPromises: Promise<void>[] = [];
      tracks.forEach((track) => {
        const node = audioNodesRef.current[track.id];
        if (!node || !node.audioElement) return;

        // Always set currentTime even if track is shorter (will be clamped by browser)
        // This resets the 'ended' state
        node.audioElement.currentTime = Math.min(startTime, node.audioElement.duration || 0);
        node.audioElement.playbackRate = playbackRateRef.current;

        // Only play if track duration allows it
        if (startTime < (node.audioElement.duration || 0)) {
          // Catch play() errors to avoid unhandled promise rejections
          const playPromise = node.audioElement.play().catch((error) => {
            // Ignore AbortError (happens when pause() is called before play() resolves)
            if (error.name !== 'AbortError') {
              console.error('Play error:', error);
            }
          });
          playPromises.push(playPromise);
        }
      });

      // Wait for all plays to start
      await Promise.all(playPromises);

      isPlayingRef.current = true;
      playbackRateRef.current = playbackState.playbackRate;
      updateTime();
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const stopPlayback = () => {
    if (isTransitioningRef.current) return;

    isPlayingRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    Object.values(audioNodesRef.current).forEach(({ audioElement }) => {
      if (audioElement) {
        try {
          audioElement.pause();
        } catch (error) {
          console.error('Pause error:', error);
        }
      }
    });
  };

  const updateTime = () => {
    if (!isPlayingRef.current) return;

    // Get time from playing audio elements (ignore those that ended)
    let elapsed = 0;
    let allEnded = true;
    let hasAudioElements = false;
    
    Object.values(audioNodesRef.current).forEach(({ audioElement }) => {
      if (audioElement) {
        hasAudioElements = true;
        if (!audioElement.ended) {
          allEnded = false;
        }
        if (!audioElement.paused && !audioElement.ended) {
          // Only consider tracks that are actively playing
          if (audioElement.currentTime > elapsed) {
            elapsed = audioElement.currentTime;
          }
        }
      }
    });

    // Handle loop
    if (loopRegionRef.current.enabled && loopRegionRef.current.end > loopRegionRef.current.start) {
      if (elapsed >= loopRegionRef.current.end) {
        // Reset all tracks to loop start immediately
        const loopStart = loopRegionRef.current.start;

        Object.values(audioNodesRef.current).forEach(({ audioElement }) => {
          if (audioElement) {
            // Clamp to track duration if loop start is beyond track length
            const newTime = Math.min(loopStart, audioElement.duration || 0);
            audioElement.currentTime = newTime;
            audioElement.playbackRate = playbackRateRef.current;

            // If track was ended or paused, restart it if loop start is within its duration
            if (newTime < (audioElement.duration || 0) && (audioElement.ended || audioElement.paused)) {
              audioElement.play().catch((error) => {
                if (error.name !== 'AbortError') {
                  console.error('Loop restart play error:', error);
                }
              });
            }
          }
        });

        seek(loopStart);
        lastUpdateTimeRef.current = loopStart;

        // Continue the update loop
        animationFrameRef.current = requestAnimationFrame(updateTime);
        return;
      }
    }

    // Handle end of all tracks (only if NOT looping)
    if (hasAudioElements && allEnded) {
      console.log('[useAudioEngine] All tracks ended, stopping');
      stopPlayback();
      pause();
      seek(0);
      lastUpdateTimeRef.current = 0;
      return;
    }

    seek(elapsed);
    lastUpdateTimeRef.current = elapsed;
    animationFrameRef.current = requestAnimationFrame(updateTime);
  };

  // Handle play/pause changes
  useEffect(() => {
    if (!audioContext) return;

    if (playbackState.isPlaying && !isPlayingRef.current) {
      startPlayback();
    } else if (!playbackState.isPlaying && isPlayingRef.current) {
      stopPlayback();
    }
  }, [playbackState.isPlaying]);

  // Handle playback rate changes
  useEffect(() => {
    // Update playback rate on all audio elements (whether playing or not)
    Object.values(audioNodesRef.current).forEach(({ audioElement }) => {
      if (audioElement) {
        audioElement.playbackRate = playbackState.playbackRate;
      }
    });
    playbackRateRef.current = playbackState.playbackRate;
  }, [playbackState.playbackRate]);

  // Handle manual seeks (when user clicks on waveform)
  useEffect(() => {
    const timeDiff = Math.abs(playbackState.currentTime - lastUpdateTimeRef.current);

    // Update audio elements for any significant time jump (manual seek)
    if (timeDiff > 0.1) {
      lastUpdateTimeRef.current = playbackState.currentTime;

      // Sync all audio elements to new time
      Object.values(audioNodesRef.current).forEach(({ audioElement }) => {
        if (audioElement) {
          audioElement.currentTime = playbackState.currentTime;
          audioElement.playbackRate = playbackRateRef.current;
        }
      });
    }
  }, [playbackState.currentTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  return {
    isReady: !!audioContext && tracks.every((t) => t.buffer !== null),
  };
};
