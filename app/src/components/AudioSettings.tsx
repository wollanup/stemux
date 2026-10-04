import { Modal } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSmallerThan } from '../theme/palette';
import RecordingInputSetting from './RecordingInputSetting';
import RecordingLatencySetting from './RecordingLatencySetting';

interface AudioSettingsProps {
  open: boolean;
  onClose: () => void;
}

/** Recording input and latency compensation */
export default function AudioSettings({ open, onClose }: AudioSettingsProps) {
  const { t } = useTranslation();
  const isMobile = useSmallerThan('xs');

  return (
    <Modal opened={open} onClose={onClose} fullScreen={isMobile} size="lg" returnFocus={false} title={t('settings.audioTitle')}>
      <RecordingInputSetting />
      <RecordingLatencySetting />
    </Modal>
  );
}
