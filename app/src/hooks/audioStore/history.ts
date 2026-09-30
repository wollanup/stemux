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

/**
 * What an edit changed, before and after: markers and loops only when they
 * changed, clips of the tracks it touched only. Restoring an entry leaves
 * everything else alone (a take recorded since keeps its place).
 */
export interface EditPart {
  markers?: Marker[];
  loops?: Omit<Loop, 'enabled'>[];
  clips: Record<string, ClipFields>;
}

export interface HistoryEntry {
  before: EditPart;
  after: EditPart;
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

const markersSignature = (snapshot: Pick<EditSnapshot, 'markers' | 'loops'>) =>
  JSON.stringify([snapshot.markers.map((m) => [m.id, m.time, m.label]), snapshot.loops.map((l) => [l.id, l.startMarkerId, l.endMarkerId])]);
const clipSignature = (clip: ClipFields | undefined) => JSON.stringify(clip && [clip.clipOffset, clip.trimStart, clip.clipDuration]);

/** What an edit can change, as a string (colors are not undone: left out) */
const signature = (snapshot: EditSnapshot) =>
  markersSignature(snapshot) + JSON.stringify(Object.entries(snapshot.clips).map(([id, c]) => [id, clipSignature(c)]));

/** The parts that differ between two snapshots, or null when nothing changed */
export function changedParts(before: EditSnapshot, after: EditSnapshot): HistoryEntry | null {
  const entry: HistoryEntry = { before: { clips: {} }, after: { clips: {} } };
  let changed = false;
  if (markersSignature(before) !== markersSignature(after)) {
    entry.before = { ...entry.before, markers: before.markers, loops: before.loops };
    entry.after = { ...entry.after, markers: after.markers, loops: after.loops };
    changed = true;
  }
  for (const id of new Set([...Object.keys(before.clips), ...Object.keys(after.clips)])) {
    if (before.clips[id] && after.clips[id] && clipSignature(before.clips[id]) !== clipSignature(after.clips[id])) {
      entry.before.clips[id] = before.clips[id];
      entry.after.clips[id] = after.clips[id];
      changed = true;
    }
  }
  return changed ? entry : null;
}

/**
 * State after restoring one side of an entry. Loops keep their current color
 * and enabled state when they still exist; clips of deleted tracks are
 * ignored; what the entry did not change stays as it is.
 */
export function restoreSnapshot(state: Pick<AudioStore, 'loopState' | 'tracks' | 'armedLoopId'>, part: EditPart) {
  const tracks = state.tracks.map((t) => (part.clips[t.id] ? { ...t, ...part.clips[t.id] } : t));
  if (!part.markers || !part.loops) return { loopState: state.loopState, tracks, armedLoopId: state.armedLoopId };
  const current = new Map(state.loopState.loops.map((l) => [l.id, l]));
  const loops: Loop[] = part.loops.map((l) => ({
    ...l,
    color: current.get(l.id)?.color ?? l.color,
    enabled: current.get(l.id)?.enabled ?? false,
  }));
  const ids = new Set(loops.map((l) => l.id));
  const activeLoopId = state.loopState.activeLoopId && ids.has(state.loopState.activeLoopId) ? state.loopState.activeLoopId : null;
  return {
    loopState: { markers: part.markers, loops, activeLoopId },
    tracks,
    armedLoopId: state.armedLoopId && ids.has(state.armedLoopId) ? state.armedLoopId : null,
  };
}

export const createHistoryActions = (set: SetState, get: () => AudioStore) => {
  /** Nested edits belong to the outermost one */
  let depth = 0;

  const apply = (part: EditPart) => {
    const next = restoreSnapshot(get(), part);
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
        const entry = changedParts(before, snapshotOf(get()));
        if (entry) {
          set((state) => ({ undoStack: [...state.undoStack, entry].slice(-HISTORY_LIMIT), redoStack: [] }));
        }
      }
    },

    undo: () => step('undoStack', 'redoStack', 'before'),
    redo: () => step('redoStack', 'undoStack', 'after'),
  };
};
