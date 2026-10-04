import { Modal, Switch, Text } from '@mantine/core';
import { IconChartBar, IconWaveSine } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useMedia } from '../theme/palette';
import { MOBILE_QUERY } from '../theme/theme';
import RecordingLatencySetting from './RecordingLatencySetting';
import classes from './Settings.module.css';

interface SettingsUIProps {
  open: boolean;
  onClose: () => void;
}

/** One setting: icon, title and description, a control on the right */
export function SettingRow({ icon, title, description, control }: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <div className={classes.line}>
      <span className={classes.icon}>{icon}</span>
      <div className={classes.text}>
        <Text fw={500}>{title}</Text>
        <Text size="sm" c="dimmed" mt={4}>
          {description}
        </Text>
      </div>
      {control}
    </div>
  );
}

export default function SettingsUI({ open, onClose }: SettingsUIProps) {
  const { t } = useTranslation();
  const isMobile = useMedia(MOBILE_QUERY);

  const waveformStyle = useAudioStore(state => state.waveformStyle);
  const setWaveformStyle = useAudioStore(state => state.setWaveformStyle);
  const waveformNormalize = useAudioStore(state => state.waveformNormalize);
  const setWaveformNormalize = useAudioStore(state => state.setWaveformNormalize);
  const isRecordingSupported = useAudioStore(state => state.isRecordingSupported);

  return (
    <Modal
      opened={open}
      onClose={onClose}
      fullScreen={isMobile}
      size={600}
      returnFocus={false}
      title={t('settings.title')}
      classNames={{ header: classes.header, body: classes.body }}
    >
      {/* Waveform Style */}
      <div className={classes.item}>
        <SettingRow
          icon={<IconWaveSine size={22} />}
          title={t('settings.waveformStyle.title')}
          description={t('settings.waveformStyle.description')}
          control={
            <Switch
              checked={waveformStyle === 'modern'}
              onChange={(e) => setWaveformStyle(e.currentTarget.checked ? 'modern' : 'classic')}
              aria-label={t('settings.waveformStyle.title')}
            />
          }
        />
      </div>

      {/* Normalize */}
      <div className={classes.item}>
        <SettingRow
          icon={<IconChartBar size={22} />}
          title={t('settings.normalize.title')}
          description={t('settings.normalize.description')}
          control={
            <Switch
              checked={waveformNormalize}
              onChange={(e) => setWaveformNormalize(e.currentTarget.checked)}
              aria-label={t('settings.normalize.title')}
            />
          }
        />
      </div>

      {/* Recording latency compensation */}
      {isRecordingSupported && <RecordingLatencySetting />}
    </Modal>
  );
}
