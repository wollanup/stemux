/**
 * Undo / redo of timeline edits: markers, loops (add, delete, move) and clips
 * (move, trim). Colors, names and the mix (volume, mute, solo) are not undone,
 * nor is enabling a loop.
 *
 * Every edit records a snapshot of these before and after. Actions made of
 * several steps (a loop is two markers + the loop) are wrapped in `edit()` so
 * that they are undone at once.
 */

import type { AudioStore, AudioTrack, Loop, Marker } from '../../types/audio';
import { saveTrackSettingsToPiece } from './storage';

type ClipFields = Pick<AudioTrack, 'clipOffset' | 'trimStart' | 'clipDuration'>;

export interface EditSnapshot {
  markers: Marker[];
  /** `enabled` is left out: enabling a loop is not an edit */
  loops: Omit<Loop, 'enabled'>[];
  clips: Record<string, ClipFields>;
}

export interface HistoryEntry {
  before: EditSnapshot;
  after: EditSnapshot;
}

const HISTORY_LIMIT = 100;

type SetState = (partial: Partial<AudioStore> | ((state: AudioStore) => Partial<AudioStore>)) => void;

export const snapshotOf = (state: Pick<AudioStore, 'loopState' | 'tracks'>): EditSnapshot => ({
  markers: state.loopState.markers,
  loops: state.loopState.loops.map(({ id, startMarkerId, endMarkerId, createdAt, color }) => ({ id, startMarkerId, endMarkerId, createdAt, color })),
  clips: Object.fromEntries(
    state.tracks.map((t) => [t.id, { clipOffset: t.clipOffset, trimStart: t.trimStart, clipDuration: t.clipDuration }])
  ),
});

/** What an edit can change, as a string (colors are not undone: left out) */
const signature = (snapshot: EditSnapshot) =>
  JSON.stringify([
    snapshot.markers.map((m) => [m.id, m.time, m.label]),
    snapshot.loops.map((l) => [l.id, l.startMarkerId, l.endMarkerId]),
    Object.entries(snapshot.clips).map(([id, c]) => [id, c.clipOffset, c.trimStart, c.clipDuration]),
  ]);

/**
 * State after restoring a snapshot. Loops keep their current color and
 * enabled state when they still exist; clips of deleted tracks are ignored,
 * tracks added since keep theirs.
 */
export function restoreSnapshot(state: Pick<AudioStore, 'loopState' | 'tracks' | 'armedLoopId'>, snapshot: EditSnapshot) {
  const current = new Map(state.loopState.loops.map((l) => [l.id, l]));
  const loops: Loop[] = snapshot.loops.map((l) => ({
    ...l,
    color: current.get(l.id)?.color ?? l.color,
    enabled: current.get(l.id)?.enabled ?? false,
  }));
  const ids = new Set(loops.map((l) => l.id));
  const activeLoopId = state.loopState.activeLoopId && ids.has(state.loopState.activeLoopId) ? state.loopState.activeLoopId : null;
  const tracks = state.tracks.map((t) => (snapshot.clips[t.id] ? { ...t, ...snapshot.clips[t.id] } : t));
  return {
    loopState: { markers: snapshot.markers, loops, activeLoopId },
    tracks,
    armedLoopId: state.armedLoopId && ids.has(state.armedLoopId) ? state.armedLoopId : null,
  };
}

export const createHistoryActions = (set: SetState, get: () => AudioStore) => {
  /** Nested edits belong to the outermost one */
  let depth = 0;

  const apply = (snapshot: EditSnapshot) => {
    const next = restoreSnapshot(get(), snapshot);
    set(next);
    const { currentPieceId, playbackState, masterVolume } = get();
    if (currentPieceId) {
      saveTrackSettingsToPiece(currentPieceId, next.tracks, next.loopState, playbackState.playbackRate, masterVolume)
        .catch((err) => console.error('Failed to save after undo/redo:', err));
    }
  };

  /**
   * Walk the history: restore the entries one after the other until one
   * changes something (entries about deleted tracks change nothing).
   */
  const step = (from: 'undoStack' | 'redoStack', to: 'undoStack' | 'redoStack', side: 'before' | 'after') => {
    const stack = [...get()[from]];
    const moved: HistoryEntry[] = [];
    while (stack.length > 0) {
      const entry = stack.pop()!;
      moved.push(entry);
      const unchanged = signature(snapshotOf(restoreSnapshot(get(), entry[side]))) === signature(snapshotOf(get()));
      if (unchanged) continue;
      apply(entry[side]);
      break;
    }
    if (moved.length > 0) set((state) => ({ [from]: stack, [to]: [...state[to], ...moved] }) as Partial<AudioStore>);
  };

  return {
    /** Run an edit (or several at once) and record it for undo */
    edit: <T>(fn: () => T): T => {
      if (depth > 0) return fn();
      const before = snapshotOf(get());
      depth++;
      try {
        return fn();
      } finally {
        depth--;
        const after = snapshotOf(get());
        if (signature(before) !== signature(after)) {
          set((state) => ({ undoStack: [...state.undoStack, { before, after }].slice(-HISTORY_LIMIT), redoStack: [] }));
        }
      }
    },

    undo: () => step('undoStack', 'redoStack', 'before'),
    redo: () => step('redoStack', 'undoStack', 'after'),
  };
};
