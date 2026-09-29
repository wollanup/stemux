/**
 * Multitrack audio engine
 *
 * All tracks are decoded into AudioBuffers and played through ONE AudioContext.
 * Every voice is started with the same `when` on the AudioContext clock, so the
 * tracks are sample-locked (unlike N independent <audio> elements, which each
 * start, buffer and drift on their own).
 *
 * Transport position is derived from the AudioContext clock:
 *   pos(t) = anchor.pos + (t - anchor.ctxTime) * rate
 *
 * At rate 1 voices are plain AudioBufferSourceNodes (bit-transparent).
 * At any other rate voices are Signalsmith Stretch worklet nodes, which keep
 * the pitch and are scheduled on the same clock, so sync is preserved.
 */

import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch';
import { logger } from '../utils/logger';

/** Delay between a transport command and the moment audio actually starts */
const START_LEAD = 0.05;
/** Stretch nodes need more time ahead to compensate their own latency */
const STRETCH_LEAD = 0.2;
/** How far ahead loop jumps are scheduled */
const LOOP_LOOKAHEAD = 0.15;
const TICK_MS = 20;

interface EngineTrack {
  id: string;
  buffer: AudioBuffer;
  /** Position of the clip on the timeline (seconds) */
  offset: number;
  gain: GainNode;
  sources: Set<AudioBufferSourceNode>;
  stretch: StretchNode | null;
  stretchPromise: Promise<StretchNode> | null;
  stretchActive: boolean;
}

interface Anchor {
  ctxTime: number;
  pos: number;
}

type EngineEvent = 'play' | 'pause' | 'seek' | 'timeupdate' | 'ended' | 'durationchange';
type Listener = () => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tracks = new Map<string, EngineTrack>();
  private gains = new Map<string, number>();
  private decodeCache = new WeakMap<Blob, Promise<AudioBuffer>>();
  private listeners = new Map<EngineEvent, Set<Listener>>();

  private playing = false;
  private rate = 1;
  private rateGeneration = 0;
  private anchor: Anchor = { ctxTime: 0, pos: 0 };
  /** Pending loop jump, scheduled ahead of time */
  private nextAnchor: Anchor | null = null;
  private loop: { start: number; end: number } | null = null;
  private tickTimer: number | null = null;
  private endedEmitted = false;

  // ─── Context ────────────────────────────────────────────────────────────

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      logger.log(`🔊 AudioContext created: ${this.ctx.sampleRate}Hz, baseLatency=${((this.ctx.baseLatency || 0) * 1000).toFixed(1)}ms`);
    }
    return this.ctx;
  }

  /** Must be called from a user gesture at least once (autoplay policy) */
  resume(): Promise<void> {
    const ctx = this.getContext();
    return ctx.state === 'running' ? Promise.resolve() : ctx.resume();
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  on(event: EngineEvent, listener: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  private emit(event: EngineEvent) {
    this.listeners.get(event)?.forEach((l) => l());
  }

  // ─── Tracks ─────────────────────────────────────────────────────────────

  decode(blob: Blob): Promise<AudioBuffer> {
    let promise = this.decodeCache.get(blob);
    if (!promise) {
      const ctx = this.getContext();
      promise = blob.arrayBuffer().then((data) => ctx.decodeAudioData(data));
      this.decodeCache.set(blob, promise);
      promise.catch(() => this.decodeCache.delete(blob));
    }
    return promise;
  }

  async loadTrack(id: string, blob: Blob, offset = 0): Promise<AudioBuffer> {
    const buffer = await this.decode(blob);
    this.addTrack(id, buffer, offset);
    return buffer;
  }

  addTrack(id: string, buffer: AudioBuffer, offset = 0) {
    const existing = this.tracks.get(id);
    if (existing?.buffer === buffer && existing.offset === offset) return;
    if (existing) this.removeTrack(id);

    const ctx = this.getContext();
    const gain = ctx.createGain();
    gain.gain.value = this.gains.get(id) ?? 1;
    gain.connect(this.master!);

    const track: EngineTrack = {
      id,
      buffer,
      offset,
      gain,
      sources: new Set(),
      stretch: null,
      stretchPromise: null,
      stretchActive: false,
    };
    this.tracks.set(id, track);

    if (this.playing) {
      // Joins in sync: its offset is computed from the shared clock
      this.startVoice(track, ctx.currentTime + this.lead());
    } else if (this.rate !== 1) {
      void this.ensureStretch(track);
    }
    this.emit('durationchange');
  }

  removeTrack(id: string) {
    const track = this.tracks.get(id);
    if (!track) return;
    this.stopVoice(track, 0);
    track.gain.disconnect();
    this.destroyStretch(track);
    this.tracks.delete(id);
    this.emit('durationchange');
  }

  hasTrack(id: string) {
    return this.tracks.has(id);
  }

  getTrackDuration(id: string): number {
    const track = this.tracks.get(id);
    return track ? track.offset + track.buffer.duration : 0;
  }

  getDuration(): number {
    let max = 0;
    this.tracks.forEach((t) => {
      max = Math.max(max, t.offset + t.buffer.duration);
    });
    return max;
  }

  // ─── Mix ────────────────────────────────────────────────────────────────

  setTrackGain(id: string, value: number) {
    this.gains.set(id, value);
    const track = this.tracks.get(id);
    if (track && this.ctx) {
      track.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    }
  }

  setMasterVolume(value: number) {
    const ctx = this.getContext();
    this.master!.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
  }

  // ─── Transport ──────────────────────────────────────────────────────────

  isPlaying() {
    return this.playing;
  }

  getPlaybackRate() {
    return this.rate;
  }

  /** Transport position (seconds) at a given AudioContext time */
  positionAt(ctxTime: number): number {
    if (!this.playing) return this.anchor.pos;
    let a = this.anchor;
    if (this.nextAnchor && ctxTime >= this.nextAnchor.ctxTime) a = this.nextAnchor;
    return a.pos + Math.max(0, ctxTime - a.ctxTime) * this.rate;
  }

  getCurrentTime(): number {
    if (!this.ctx) return this.anchor.pos;
    return Math.min(this.positionAt(this.ctx.currentTime), this.getDuration() || Infinity);
  }

  /**
   * Start playback. Returns the anchor: the AudioContext time at which audio
   * starts and the transport position at that instant (used by the recorder).
   */
  play(): Anchor {
    const ctx = this.getContext();
    void this.resume();
    if (this.playing) return { ...this.anchor };

    const when = ctx.currentTime + this.lead();
    this.anchor = { ctxTime: when, pos: this.anchor.pos };
    this.nextAnchor = null;
    this.playing = true;
    this.endedEmitted = false;
    this.tracks.forEach((t) => this.startVoice(t, when));
    this.startTicking();
    this.emit('play');
    logger.debug(`▶️ Engine play at ctx=${when.toFixed(4)}s pos=${this.anchor.pos.toFixed(4)}s`);
    return { ...this.anchor };
  }

  pause() {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    const pos = Math.min(this.positionAt(now), this.getDuration());
    this.tracks.forEach((t) => this.stopVoice(t, now));
    this.playing = false;
    this.anchor = { ctxTime: now, pos };
    this.nextAnchor = null;
    this.stopTicking();
    this.emit('pause');
    this.emit('timeupdate');
  }

  seek(pos: number) {
    const clamped = Math.max(0, Math.min(pos, this.getDuration() || pos));
    if (!this.playing || !this.ctx) {
      this.anchor = { ctxTime: this.ctx?.currentTime ?? 0, pos: clamped };
      this.nextAnchor = null;
    } else {
      this.restartAt(clamped, this.ctx.currentTime + this.lead());
    }
    this.endedEmitted = false;
    this.emit('seek');
    this.emit('timeupdate');
  }

  async setPlaybackRate(rate: number) {
    const generation = ++this.rateGeneration;
    if (rate !== 1) {
      // Prepare every stretch node BEFORE switching, so all tracks switch together
      await Promise.all(Array.from(this.tracks.values()).map((t) => this.ensureStretch(t)));
      if (generation !== this.rateGeneration) return;
    }
    if (rate === this.rate) return;

    const previousRate = this.rate;
    if (this.playing && this.ctx) {
      const when = this.ctx.currentTime + STRETCH_LEAD;
      const pos = this.positionAt(when);
      this.tracks.forEach((t) => this.stopVoice(t, when));
      this.rate = rate;
      this.restartAt(pos, when);
    } else {
      this.rate = rate;
    }

    if (rate === 1 && previousRate !== 1) {
      // Free the worklets (CPU + a copy of every buffer) once they stopped
      const tracks = Array.from(this.tracks.values());
      window.setTimeout(() => {
        if (this.rate === 1) tracks.forEach((t) => this.destroyStretch(t));
      }, (STRETCH_LEAD + 0.1) * 1000);
    }
  }

  setLoop(loop: { start: number; end: number } | null) {
    const same =
      (loop === null && this.loop === null) ||
      (loop !== null && this.loop !== null && loop.start === this.loop.start && loop.end === this.loop.end);
    if (same) return;
    this.loop = loop && loop.end > loop.start ? { ...loop } : null;

    // A jump may already be scheduled for the previous loop: reschedule
    if (this.playing && this.nextAnchor && this.ctx) {
      const when = this.ctx.currentTime + this.lead();
      this.restartAt(this.positionAt(when), when);
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private lead() {
    return this.rate === 1 ? START_LEAD : STRETCH_LEAD;
  }

  private restartAt(pos: number, when: number) {
    this.tracks.forEach((t) => this.stopVoice(t, when));
    this.anchor = { ctxTime: when, pos };
    this.nextAnchor = null;
    this.tracks.forEach((t) => this.startVoice(t, when));
  }

  private startVoice(track: EngineTrack, when: number, pos = this.positionAt(when)) {
    const ctx = this.getContext();
    if (this.rate === 1) {
      // Position inside the clip; a clip placed later on the timeline starts delayed
      const clipPos = pos - track.offset;
      if (clipPos >= track.buffer.duration) return;
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.connect(track.gain);
      source.onended = () => {
        source.disconnect();
        track.sources.delete(source);
      };
      const startAt = Math.max(when, ctx.currentTime) + Math.max(0, -clipPos) / this.rate;
      source.start(startAt, Math.max(0, clipPos));
      track.sources.add(source);
      return;
    }

    if (!track.stretch) {
      // Not ready yet: join as soon as it is (still in sync thanks to the shared clock)
      void this.ensureStretch(track).then(() => {
        if (this.playing && this.rate !== 1 && this.tracks.get(track.id) === track && !track.stretchActive) {
          this.startVoice(track, this.ctx!.currentTime + STRETCH_LEAD);
        }
      });
      return;
    }
    track.stretch.connect(track.gain);
    // Negative input positions are rendered as silence by the stretch node
    void track.stretch.schedule({ active: true, output: when, input: pos - track.offset, rate: this.rate });
    track.stretchActive = true;
  }

  private stopVoice(track: EngineTrack, when: number) {
    track.sources.forEach((source) => {
      try {
        source.stop(when);
      } catch {
        // already stopped
      }
    });
    if (track.stretch && track.stretchActive) {
      void track.stretch.schedule({ active: false, output: when });
      track.stretchActive = false;
    }
  }

  private ensureStretch(track: EngineTrack): Promise<StretchNode> {
    if (!track.stretchPromise) {
      const ctx = this.getContext();
      // Default options (1 unconnected input, stereo output): buffer playback mode
      track.stretchPromise = SignalsmithStretch(ctx).then(async (node) => {
        const channels: Float32Array[] = [];
        for (let c = 0; c < track.buffer.numberOfChannels; c++) {
          channels.push(track.buffer.getChannelData(c));
        }
        await node.addBuffers(channels);
        track.stretch = node;
        return node;
      });
    }
    return track.stretchPromise;
  }

  private destroyStretch(track: EngineTrack) {
    const promise = track.stretchPromise;
    track.stretch = null;
    track.stretchPromise = null;
    track.stretchActive = false;
    promise?.then((node) => {
      void node.stop();
      void node.dropBuffers();
      node.disconnect();
    }).catch(() => undefined);
  }

  private startTicking() {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicking() {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick() {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.nextAnchor && now >= this.nextAnchor.ctxTime) {
      this.anchor = this.nextAnchor;
      this.nextAnchor = null;
    }

    const pos = this.positionAt(now);

    if (this.loop && !this.nextAnchor) {
      const { start, end } = this.loop;
      if (pos >= end) {
        // Missed the loop end (e.g. loop moved behind the cursor): jump now
        this.restartAt(start, now + this.lead());
      } else if (this.anchor.pos < end) {
        const endCtxTime = this.anchor.ctxTime + (end - this.anchor.pos) / this.rate;
        if (endCtxTime - now < LOOP_LOOKAHEAD) {
          this.scheduleLoopJump(Math.max(endCtxTime, now + 0.005), start);
        }
      }
    }

    const duration = this.getDuration();
    if (!this.loop && duration > 0 && pos >= duration && !this.endedEmitted) {
      this.endedEmitted = true;
      this.emit('ended');
    }

    this.emit('timeupdate');
  }

  /** Sample-accurate, gapless jump back to the loop start */
  private scheduleLoopJump(when: number, loopStart: number) {
    this.nextAnchor = { ctxTime: when, pos: loopStart };
    this.tracks.forEach((track) => {
      if (this.rate === 1) {
        track.sources.forEach((source) => {
          try {
            source.stop(when);
          } catch {
            // already stopped
          }
        });
        this.startVoice(track, when, loopStart);
      } else if (track.stretch) {
        void track.stretch.schedule({ active: true, output: when, input: loopStart - track.offset, rate: this.rate });
        track.stretchActive = true;
      }
    });
  }
}

export const audioEngine = new AudioEngine();
