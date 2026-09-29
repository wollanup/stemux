/**
 * Minimal HTMLMediaElement stand-in given to WaveSurfer (`media` option).
 *
 * WaveSurfer is only used to DRAW the waveform: it reads the playhead from the
 * shared AudioEngine clock through this proxy and never produces sound itself.
 * Seeking/playing is driven by the store, never by WaveSurfer.
 */

import { audioEngine } from './AudioEngine';

type Handler = (...args: unknown[]) => void;

export class EngineMediaProxy {
  private readonly trackId: string;
  private handlers = new Map<string, Set<Handler>>();
  private unsubscribers: Array<() => void>;

  // Properties WaveSurfer reads or writes
  currentSrc = '';
  src = '';
  seeking = false;
  ended = false;
  error: MediaError | null = null;
  autoplay = false;
  controls = false;
  volume = 1;
  muted = false;
  playbackRate = 1;
  preservesPitch = true;

  constructor(trackId: string) {
    this.trackId = trackId;
    this.unsubscribers = [
      audioEngine.on('play', () => this.dispatch('play')),
      audioEngine.on('pause', () => this.dispatch('pause')),
      audioEngine.on('seek', () => this.dispatch('timeupdate')),
    ];
  }

  get paused() {
    return !audioEngine.isPlaying();
  }

  get duration() {
    return audioEngine.getTrackDuration(this.trackId);
  }

  get currentTime() {
    return Math.min(audioEngine.getCurrentTime(), this.duration);
  }

  set currentTime(_value: number) {
    // Ignored: the engine is the single source of truth for the position
  }

  addEventListener(event: string, handler: Handler, options?: { once?: boolean }) {
    let wrapped = handler;
    if (options?.once) {
      wrapped = (...args: unknown[]) => {
        this.removeEventListener(event, wrapped);
        handler(...args);
      };
    }
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(wrapped);
  }

  removeEventListener(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  private dispatch(event: string) {
    this.handlers.get(event)?.forEach((h) => h());
  }

  play() {
    return Promise.resolve();
  }

  pause() {}

  load() {}

  remove() {}

  removeAttribute() {}

  canPlayType() {
    return '';
  }

  destroy() {
    this.unsubscribers.forEach((u) => u());
    this.handlers.clear();
  }

  asMediaElement(): HTMLMediaElement {
    return this as unknown as HTMLMediaElement;
  }
}
