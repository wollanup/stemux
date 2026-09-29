import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AudioStore, AudioTrack, PieceSettings } from '../../../types/audio';

const db = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  files: new Map<string, File>(),
}));

vi.mock('../../../utils/indexedDB', () => ({
  saveAudioFile: async (id: string, file: File) => void db.files.set(id, file),
  deleteAudioFile: async (id: string) => void db.files.delete(id),
  getPiece: async () => ({ id: 'p', name: 'p', createdAt: 0, updatedAt: 0, trackIds: [] }),
  savePiece: async () => undefined,
  savePieceSettings: async (id: string, settings: PieceSettings) => void db.settings.set(id, structuredClone(settings)),
}));
vi.mock('../../../audio/AudioEngine', () => ({ audioEngine: {} }));
vi.mock('../../../audio/micSession', () => ({}));
vi.mock('../../../i18n/config', () => ({ default: { t: (k: string) => k } }));

const { createRecordingActions } = await import('../recording');

const recordable: AudioTrack = {
  id: 'rec',
  name: 'take',
  volume: 0.8,
  isMuted: false,
  isSolo: false,
  color: '#fff',
  isRecordable: true,
  recordingState: 'stopped',
  recordingStartOffset: 30,
};

const makeStore = () => {
  const seek = vi.fn();
  const store = createStore<AudioStore>()((set, get) => ({
    tracks: [recordable],
    currentPieceId: 'p',
    loopState: { markers: [], loops: [], activeLoopId: null },
    playbackState: { isPlaying: false, currentTime: 0, duration: 180, playbackRate: 1 },
    masterVolume: 1,
    seek,
    ...createRecordingActions(set, get),
  }) as unknown as AudioStore);
  return { store, seek };
};

describe('recorded clips', () => {
  beforeEach(() => {
    db.settings.clear();
    db.files.clear();
  });

  it('keeps the clip position on the track and in the saved piece', async () => {
    const { store, seek } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 29.98);

    expect(store.getState().tracks[0].clipOffset).toBe(29.98);
    const saved = db.settings.get('p') as PieceSettings;
    expect(saved.trackSettings[0].clipOffset).toBe(29.98);
    // Back to where the take started, ready to listen
    expect(seek).toHaveBeenCalledWith(30);
  });

  it('forgets the clip position when the recording is cleared', async () => {
    const { store } = makeStore();
    await store.getState().saveRecording('rec', new Blob(['wav']), 12);
    await store.getState().clearRecording('rec');

    expect(store.getState().tracks[0].clipOffset).toBeUndefined();
    expect((db.settings.get('p') as PieceSettings).trackSettings[0].clipOffset).toBeUndefined();
  });
});
