import { useState } from 'react';
import { Alert, Box, Button, Group, Loader, Slider, Switch, Text } from '@mantine/core';
import { IconStopwatch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  calibrateRoundTripLatency,
  estimateRoundTripLatency,
  loadLatencyOverrideMs,
  saveLatencyOverrideMs,
} from '../audio/latency';
import { SettingRow } from './SettingsUI';
import classes from './Settings.module.css';

const MAX_LATENCY_MS = 500;

export default function RecordingLatencySetting() {
  const { t } = useTranslation();
  const [override, setOverride] = useState<number | null>(loadLatencyOverrideMs);
  const [calibrating, setCalibrating] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const estimateMs = Math.round(estimateRoundTripLatency() * 1000);
  const isAuto = override === null;

  const update = (value: number | null) => {
    setOverride(value);
    saveLatencyOverrideMs(value);
  };

  const calibrate = async () => {
    setCalibrating(true);
    setMessage(null);
    try {
      const ms = await calibrateRoundTripLatency();
      update(ms);
      setMessage({ severity: 'success', text: t('settings.latency.calibrationDone', { ms }) });
    } catch (error) {
      console.error('Latency calibration failed:', error);
      setMessage({ severity: 'error', text: t('settings.latency.calibrationFailed') });
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <div className={classes.item}>
      <SettingRow
        icon={<IconStopwatch size={20} />}
        title={t('settings.latency.title')}
        description={isAuto ? t('settings.latency.autoDescription', { ms: estimateMs }) : t('settings.latency.manualDescription')}
        control={
          <Switch
            label={t('settings.latency.auto')}
            labelPosition="left"
            checked={isAuto}
            onChange={(e) => update(e.currentTarget.checked ? null : estimateMs)}
          />
        }
      />

      {!isAuto && (
        <Group gap="md" pl={50} mt="xs" wrap="nowrap">
          <Slider
            value={override}
            min={0}
            max={MAX_LATENCY_MS}
            step={1}
            onChange={update}
            aria-label={t('settings.latency.title')}
            style={{ flex: 1 }}
          />
          <Text size="sm" miw={64} ta="right">
            {override} ms
          </Text>
        </Group>
      )}

      <Box pl={50} mt="xs">
        <Text size="sm" c="dimmed" mb="xs">
          {t('settings.latency.calibrationHelp')}
        </Text>
        <Button
          variant="outline"
          size="xs"
          onClick={calibrate}
          disabled={calibrating}
          leftSection={calibrating ? <Loader size={14} /> : undefined}
        >
          {calibrating ? t('settings.latency.calibrating') : t('settings.latency.calibrate')}
        </Button>
        {message && (
          <Alert color={message.severity === 'success' ? 'green' : 'red'} mt="xs">
            {message.text}
          </Alert>
        )}
      </Box>
    </div>
  );
}
