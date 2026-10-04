import { Alert, Button, Group, List, Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconCircleCheck, IconDeviceMobile, IconMicrophone } from '@tabler/icons-react';
import { useMedia } from '../theme/palette';
import { MOBILE_QUERY } from '../theme/theme';

interface RecordingPermissionGuideProps {
  open: boolean;
  onClose: () => void;
}

const Step = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <List.Item icon={icon}>
    <Text>{title}</Text>
    <Text size="sm" c="dimmed">
      {description}
    </Text>
  </List.Item>
);

const RecordingPermissionGuide = ({ open, onClose }: RecordingPermissionGuideProps) => {
  const { t } = useTranslation();
  const isMobile = useMedia(MOBILE_QUERY);

  return (
    <Modal
      opened={open}
      onClose={onClose}
      fullScreen={isMobile}
      size={600}
      title={t('recordingGuide.title')}
    >
      <Alert color="blue" mb="lg">
        {t('recordingGuide.intro')}
      </Alert>

      <Text size="sm" fw={600} mt="md" mb="xs">
        {t('recordingGuide.stepsTitle')}
      </Text>

      <List spacing="md" center>
        <Step
          icon={<IconDeviceMobile size={24} color="var(--app-primary)" />}
          title={t('recordingGuide.step1Title')}
          description={t('recordingGuide.step1Description')}
        />
        <Step
          icon={<IconMicrophone size={24} color="var(--app-primary)" />}
          title={t('recordingGuide.step2Title')}
          description={t('recordingGuide.step2Description')}
        />
        <Step
          icon={<IconCircleCheck size={24} color="var(--app-success)" />}
          title={t('recordingGuide.step3Title')}
          description={t('recordingGuide.step3Description')}
        />
      </List>

      <Alert color="orange" mt="lg">
        {t('recordingGuide.troubleshoot')}
      </Alert>

      <Text size="xs" c="dimmed" mt="md">
        {t('recordingGuide.footer')}
      </Text>

      <Group justify="flex-end" mt="lg">
        <Button onClick={onClose}>{t('recordingGuide.understood')}</Button>
      </Group>
    </Modal>
  );
};

export default RecordingPermissionGuide;
