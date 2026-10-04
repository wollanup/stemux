/**
 * Recording input: which device (sound card, built-in mic…) and which of its
 * channels. A 2-input sound card shows up in the browser as ONE stereo device:
 * input 1 is the left channel, input 2 the right one.
 */

const DEVICE_KEY = 'recording-input-device';
const CHANNEL_KEY = 'recording-input-channel';

export interface InputSelection {
  /** null: the system default device */
  deviceId: string | null;
  /** 0-based channel of the device */
  channel: number;
}

export interface InputDevice {
  deviceId: string;
  label: string;
  /** Channel count if the browser tells it (Chrome, after permission) */
  channels: number | null;
}

export const loadInputSelection = (): InputSelection => {
  const channel = parseInt(localStorage.getItem(CHANNEL_KEY) ?? '', 10);
  return {
    deviceId: localStorage.getItem(DEVICE_KEY),
    channel: Number.isInteger(channel) && channel >= 0 ? channel : 0,
  };
};

export const saveInputSelection = ({ deviceId, channel }: InputSelection) => {
  if (deviceId === null) localStorage.removeItem(DEVICE_KEY);
  else localStorage.setItem(DEVICE_KEY, deviceId);
  localStorage.setItem(CHANNEL_KEY, String(channel));
};

/**
 * Audio inputs. The "default" and "communications" pseudo-devices (Chrome) are
 * left out: the default one is the null selection.
 */
export async function listInputDevices(): Promise<InputDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d) => {
      const capabilities = (d as InputDeviceInfo).getCapabilities?.() as (MediaTrackCapabilities & { channelCount?: { max?: number } }) | undefined;
      return { deviceId: d.deviceId, label: d.label, channels: capabilities?.channelCount?.max ?? null };
    });
}

/** Device names stay empty until the site may use the mic: ask once, release right away */
export async function unlockDeviceLabels(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}
