import { Box, Group, Modal, Switch, Text, ThemeIcon } from '@mantine/core';
import { IconChartBar, IconWaveSine } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useSmallerThan } from '../theme/palette';
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
    <Group wrap="nowrap" gap="md">
      <ThemeIcon variant="light" size="lg">
        {icon}
      </ThemeIcon>
      <Box flex={1} miw={0}>
        <Text fw={500}>{title}</Text>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </Box>
      {control}
    </Group>
  );
}

export default function SettingsUI({ open, onClose }: SettingsUIProps) {
  const { t } = useTranslation();
  const isMobile = useSmallerThan('xs');

  const waveformStyle = useAudioStore(state => state.waveformStyle);
  const setWaveformStyle = useAudioStore(state => state.setWaveformStyle);
  const waveformNormalize = useAudioStore(state => state.waveformNormalize);
  const setWaveformNormalize = useAudioStore(state => state.setWaveformNormalize);

  return (
    <Modal
      opened={open}
      onClose={onClose}
      fullScreen={isMobile}
      size="lg"
      returnFocus={false}
      title={t('settings.title')}
    >
      {/* Waveform Style */}
      <div className={classes.item}>
        <SettingRow
          icon={<IconWaveSine size={20} />}
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
          icon={<IconChartBar size={20} />}
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
    </Modal>
  );
}
