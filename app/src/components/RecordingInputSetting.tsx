import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Group, Progress, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { audioEngine } from '../audio/AudioEngine';
import { MicRecorder } from '../audio/MicRecorder';
import { applyInputSelection } from '../audio/micSession';
import {
  listInputDevices,
  loadInputSelection,
  saveInputSelection,
  unlockDeviceLabels,
  type InputDevice,
  type InputSelection,
} from '../audio/inputDevice';
import { SettingRow } from './SettingsUI';
import classes from './Settings.module.css';

const DEFAULT_VALUE = 'default';
/** Above this, the inputs are picked from a list instead of buttons */
const MAX_SEGMENTS = 4;

const peakToPercent = (peak: number) => {
  const db = peak > 0 ? 20 * Math.log10(peak) : -60;
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
};

export default function RecordingInputSetting() {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<InputSelection>(loadInputSelection);
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [testing, setTesting] = useState(false);
  const [tester, setTester] = useState<MicRecorder | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [error, setError] = useState(false);

  const refreshDevices = useCallback(() => {
    listInputDevices().then(setDevices, (e) => console.error('Failed to list audio inputs:', e));
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  // Test: opens the chosen device and shows the level of each of its inputs
  useEffect(() => {
    if (!testing) return;
    let cancelled = false;
    let recorder: MicRecorder | null = null;
    let unsubscribe = () => {};
    audioEngine
      .resume()
      .then(() => {
        recorder = new MicRecorder(audioEngine.getContext(), { deviceId: selection.deviceId, channel: 0 });
        return recorder.open();
      })
      .then(() => {
        if (cancelled) return;
        unsubscribe = recorder!.onLevel((_, all) => setPeaks(all));
        setTester(recorder);
        refreshDevices(); // names are known now
      })
      .catch((e) => {
        console.error('Failed to open the audio input:', e);
        if (!cancelled) {
          setError(true);
          setTesting(false);
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
      recorder?.close();
      setTester(null);
      setPeaks([]);
    };
  }, [testing, selection.deviceId, refreshDevices]);

  const update = (next: InputSelection) => {
    setSelection(next);
    saveInputSelection(next);
    applyInputSelection(next);
  };

  const unlock = async () => {
    try {
      await unlockDeviceLabels();
      refreshDevices();
    } catch (e) {
      console.error('Microphone access refused:', e);
      setError(true);
    }
  };

  const namesHidden = devices.length > 0 && devices.some((d) => !d.label);
  const selected = devices.find((d) => d.deviceId === selection.deviceId);
  const deviceOptions = [
    { value: DEFAULT_VALUE, label: t('settings.input.defaultDevice') },
    ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || t('settings.input.unnamed', { n: i + 1 }) })),
  ];
  if (selection.deviceId !== null && !selected && !namesHidden) {
    deviceOptions.push({ value: selection.deviceId, label: t('settings.input.missing') });
  }

  const channelCount = tester?.getChannelCount() || selected?.channels || 2;
  const channels = Array.from({ length: channelCount }, (_, i) => ({ value: String(i), label: t('settings.input.channelN', { n: i + 1 }) }));
  const channel = Math.min(selection.channel, channelCount - 1);
  const setChannel = (value: string | null) => {
    if (value !== null) update({ ...selection, channel: parseInt(value, 10) });
  };

  return (
    <div className={classes.item}>
      <SettingRow
        icon={<IconMicrophone size={20} />}
        title={t('settings.input.title')}
        description={t('settings.input.description')}
        control={null}
      />

      <Stack gap="xs" pl={50} mt="xs">
        <Select
          label={t('settings.input.device')}
          data={deviceOptions}
          value={selection.deviceId ?? DEFAULT_VALUE}
          onChange={(value) => update({ deviceId: !value || value === DEFAULT_VALUE ? null : value, channel: 0 })}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
        {namesHidden && (
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed" flex={1}>
              {t('settings.input.namesHidden')}
            </Text>
            <Button variant="light" size="xs" onClick={unlock}>
              {t('settings.input.showNames')}
            </Button>
          </Group>
        )}

        {channelCount > 1 && (
          <Box>
            <Text size="sm" fw={500} mb={4}>
              {t('settings.input.channel')}
            </Text>
            {channelCount <= MAX_SEGMENTS ? (
              <SegmentedControl data={channels} value={String(channel)} onChange={setChannel} />
            ) : (
              <Select data={channels} value={String(channel)} onChange={setChannel} allowDeselect={false} maw={200} />
            )}
          </Box>
        )}

        <Box>
          <Button variant="outline" size="xs" onClick={() => {
              setError(false);
              setTesting((v) => !v);
            }}>
            {testing ? t('settings.input.stopTest') : t('settings.input.test')}
          </Button>
          {testing && (
            <Stack gap={6} mt="xs">
              <Text size="sm" c="dimmed">
                {t('settings.input.testHelp')}
              </Text>
              {Array.from({ length: tester?.getChannelCount() ?? 0 }, (_, i) => (
                <Group key={i} gap="sm" wrap="nowrap">
                  <Text size="sm" w={72} fw={i === channel ? 600 : 400} c={i === channel ? undefined : 'dimmed'}>
                    {t('settings.input.channelN', { n: i + 1 })}
                  </Text>
                  <Progress
                    value={peakToPercent(peaks[i] ?? 0)}
                    color={(peaks[i] ?? 0) > 0.9 ? 'red' : (peaks[i] ?? 0) > 0.5 ? 'orange' : 'green'}
                    size="sm"
                    transitionDuration={50}
                    flex={1}
                  />
                </Group>
              ))}
            </Stack>
          )}
        </Box>

        {error && (
          <Alert color="red">
            {t('settings.input.openFailed')}
          </Alert>
        )}
      </Stack>
    </div>
  );
}
