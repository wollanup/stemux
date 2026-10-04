import { Box, Divider, Group, Kbd, Modal, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconArrowsLeftRight,
  IconArrowsMove,
  IconDotsVertical,
  IconGauge,
  IconHandFinger,
  IconHandStop,
  IconHeadphones,
  IconMagnet,
  IconMusic,
  IconRepeat,
  IconRuler,
  IconSparkles,
  IconVolume,
  IconWaveSine,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSmallerThan } from '../theme/palette';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

// Helper components defined OUTSIDE of render to avoid recreation
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box mb="lg">
    <Title order={4} c="var(--mantine-primary-color-filled)" mb="xs">
      {title}
    </Title>
    {children}
  </Box>
);

const Subtitle = ({ children, mt }: { children: React.ReactNode; mt?: string }) => (
  <Text fw={600} mb={4} mt={mt}>
    {children}
  </Text>
);

const ControlItem = ({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <Group gap="md" mb="md" align="flex-start" wrap="nowrap">
    <ThemeIcon size={40} radius="sm">
      {icon}
    </ThemeIcon>
    <Box flex={1}>
      <Text size="sm" fw={600} mb={4}>
        {title}
      </Text>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </Box>
  </Group>
);

const Shortcut = ({ keys, children }: { keys: string; children: React.ReactNode }) => (
  <Group gap="xs">
    <Kbd>{keys}</Kbd>
    <Text size="sm">{children}</Text>
  </Group>
);

const ICON = 22;

const HelpModal = ({ open, onClose }: HelpModalProps) => {
  const { t } = useTranslation();
  const fullScreen = useSmallerThan('xs');

  return (
    <Modal
      opened={open}
      onClose={onClose}
      size="xl"
      fullScreen={fullScreen}
      title={<Title order={3}>{t('help.title')}</Title>}
    >
      {/* Welcome */}
      <Section title={t('help.sections.welcome.title')}>
        <Text>{t('help.sections.welcome.description')}</Text>
      </Section>

      <Divider my="lg" />

      {/* Pieces Management */}
      <Section title={t('help.sections.pieces.title')}>
        <Text size="sm" c="dimmed">
          {t('help.sections.pieces.description')}
        </Text>
      </Section>

      <Divider my="lg" />

      {/* Getting Started */}
      <Section title={t('help.sections.basics.title')}>
        <Subtitle>{t('help.sections.basics.uploadTitle')}</Subtitle>
        <Text size="sm" c="dimmed">
          {t('help.sections.basics.uploadDesc')}
        </Text>

        <Subtitle mt="md">{t('help.sections.basics.playbackTitle')}</Subtitle>
        <Text size="sm" c="dimmed">
          {t('help.sections.basics.playbackDesc')}
        </Text>
      </Section>

      <Divider my="lg" />

      {/* Track Controls */}
      <Section title={t('help.sections.tracks.title')}>
        <ControlItem icon={<IconHeadphones size={ICON} />} title={t('help.sections.tracks.soloTitle')} description="" />
        <Stack gap="xs" ml={56} mb="md">
          <Text size="sm">• {t('help.sections.tracks.soloShort')}</Text>
          <Text size="sm">• {t('help.sections.tracks.soloLong')}</Text>
        </Stack>

        <ControlItem icon={<IconVolume size={ICON} />} title={t('help.sections.tracks.muteTitle')} description="" />
        <Stack gap="xs" ml={56} mb="md">
          <Text size="sm">• {t('help.sections.tracks.muteShort')}</Text>
          <Text size="sm">• {t('help.sections.tracks.muteLong')}</Text>
        </Stack>

        <ControlItem icon={<IconGauge size={ICON} />} title={t('help.sections.tracks.volumeTitle')} description={t('help.sections.tracks.volumeDesc')} />
        <ControlItem icon={<IconWaveSine size={ICON} />} title={t('help.sections.tracks.meterTitle')} description={t('help.sections.tracks.meterDesc')} />
        <ControlItem icon={<IconDotsVertical size={ICON} />} title={t('help.sections.tracks.menuTitle')} description={t('help.sections.tracks.menuDesc')} />
      </Section>

      <Divider my="lg" />

      {/* Clips */}
      <Section title={t('help.sections.clips.title')}>
        <ControlItem icon={<IconHandStop size={ICON} />} title={t('help.sections.clips.scrollTitle')} description={t('help.sections.clips.scrollDesc')} />
        <ControlItem icon={<IconArrowsMove size={ICON} />} title={t('help.sections.clips.moveTitle')} description={t('help.sections.clips.moveDesc')} />
        <ControlItem icon={<IconArrowsLeftRight size={ICON} />} title={t('help.sections.clips.trimTitle')} description={t('help.sections.clips.trimDesc')} />
        <ControlItem icon={<IconMagnet size={ICON} />} title={t('help.sections.clips.snapTitle')} description={t('help.sections.clips.snapDesc')} />
      </Section>

      <Divider my="lg" />

      {/* Loop System */}
      <Section title={t('help.sections.loops.title')}>
        <ControlItem icon={<IconRepeat size={ICON} />} title={t('help.sections.loops.openTitle')} description={t('help.sections.loops.openDesc')} />

        <Subtitle mt="lg">{t('help.sections.loops.editTitle')}</Subtitle>
        <Text size="sm" c="dimmed" mb="md">
          {t('help.sections.loops.editDesc')}
        </Text>

        <Subtitle>{t('help.sections.loops.manageTitle')}</Subtitle>
        <Text size="sm" c="dimmed" mb="md">
          {t('help.sections.loops.manageDesc')}
        </Text>

        <Subtitle>{t('help.sections.loops.activeTitle')}</Subtitle>
        <Text size="sm" c="dimmed">
          {t('help.sections.loops.activeDesc')}
        </Text>
      </Section>

      <Divider my="lg" />

      {/* Tempo */}
      <Section title={t('help.sections.tempo.title')}>
        <ControlItem icon={<IconMusic size={ICON} />} title={t('help.sections.tempo.setTitle')} description={t('help.sections.tempo.setDesc')} />
        <ControlItem icon={<IconHandFinger size={ICON} />} title={t('help.sections.tempo.tapTitle')} description={t('help.sections.tempo.tapDesc')} />
        <ControlItem icon={<IconSparkles size={ICON} />} title={t('help.sections.tempo.detectTitle')} description={t('help.sections.tempo.detectDesc')} />
        <ControlItem icon={<IconRuler size={ICON} />} title={t('help.sections.tempo.barsTitle')} description={t('help.sections.tempo.barsDesc')} />
      </Section>

      <Divider my="lg" />

      {/* Keyboard Shortcuts */}
      <Section title={t('help.sections.keyboard.title')}>
        <Stack gap="xs" mb="md">
          <Shortcut keys="SPACE">{t('help.sections.keyboard.space')}</Shortcut>
          <Shortcut keys="←">{t('help.sections.keyboard.arrowLeft')}</Shortcut>
          <Shortcut keys="→">{t('help.sections.keyboard.arrowRight')}</Shortcut>
          <Shortcut keys="Ctrl + ←">{t('help.sections.keyboard.ctrlLeft')}</Shortcut>
          <Shortcut keys="Ctrl + 🖱️">{t('help.sections.keyboard.ctrlWheel')}</Shortcut>
          <Shortcut keys="Shift + 🖱️">{t('help.sections.keyboard.altWheel')}</Shortcut>
          <Shortcut keys="Ctrl + Z">{t('help.sections.keyboard.undo')}</Shortcut>
          <Shortcut keys="Ctrl + Shift + Z">{t('help.sections.keyboard.redo')}</Shortcut>
          <Shortcut keys="Alt">{t('help.sections.keyboard.altSnap')}</Shortcut>
        </Stack>
        <Text size="xs" c="dimmed" fs="italic">
          {t('help.sections.keyboard.more')}
        </Text>
      </Section>

      <Divider my="lg" />

      {/* Tips */}
      <Section title={t('help.sections.tips.title')}>
        <Stack gap="xs">
          <Text size="sm">💡 {t('help.sections.tips.tip1')}</Text>
          <Text size="sm">💾 {t('help.sections.tips.tip2')}</Text>
          <Text size="sm">🖱️ {t('help.sections.tips.tip4')}</Text>
        </Stack>
      </Section>
    </Modal>
  );
};

export default HelpModal;
