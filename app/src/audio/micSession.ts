/**
 * The microphone is opened when a track is ARMED (permission prompt, device
 * start-up), so that pressing play starts recording instantly and exactly.
 */

import { audioEngine } from './AudioEngine';
import { MicRecorder } from './MicRecorder';
import type { InputSelection } from './inputDevice';
import { logger } from '../utils/logger';

let recorder: MicRecorder | null = null;
let opening: Promise<MicRecorder> | null = null;
let wanted = false;
let pendingStop: Promise<unknown> | null = null;
const listeners = new Set<(recorder: MicRecorder | null) => void>();

const notify = () => listeners.forEach((l) => l(recorder));

export const openMic = (): Promise<MicRecorder> => {
  wanted = true;
  if (recorder) return Promise.resolve(recorder);
  if (!opening) {
    const candidate = new MicRecorder(audioEngine.getContext());
    opening = audioEngine
      .resume()
      .then(() => candidate.open())
      .then(() => {
        if (!wanted) {
          // Disarmed while the permission prompt was open
          candidate.close();
          throw new Error('mic-closed');
        }
        recorder = candidate;
        notify();
        return candidate;
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
};

export const getMic = () => recorder;

/** Keeps the mic open until an in-flight stop has delivered its take */
export const trackStop = <T>(promise: Promise<T>): Promise<T> => {
  pendingStop = promise;
  void promise.finally(() => {
    if (pendingStop === promise) pendingStop = null;
  });
  return promise;
};

export const closeMic = () => {
  wanted = false;
  const close = () => {
    if (wanted || !recorder) return; // re-armed in the meantime
    recorder.close();
    recorder = null;
    notify();
  };
  if (pendingStop) {
    pendingStop.then(close, close);
  } else {
    close();
  }
};

/**
 * New input chosen in the settings: the open mic follows right away, unless a
 * take is being recorded (it then applies from the next arming).
 */
export const applyInputSelection = (selection: InputSelection) => {
  if (!recorder || recorder.isRecording() || pendingStop) return;
  if (selection.deviceId === recorder.getDeviceId()) {
    recorder.setChannel(selection.channel);
    return;
  }
  recorder.close();
  recorder = null;
  notify();
  openMic().catch((error: Error) => logger.error('Failed to reopen microphone:', error));
};

export const subscribeMic = (listener: (recorder: MicRecorder | null) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
