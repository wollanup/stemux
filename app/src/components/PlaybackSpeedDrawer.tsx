import { useState } from 'react';
import { Box, Button, Drawer, SimpleGrid, Slider, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface PlaybackSpeedDrawerProps {
  open: boolean;
  currentRate: number;
  onClose: () => void;
  onRateChange: (rate: number) => void;
}

const SLOW_SPEEDS = [0.5, 0.7, 0.8, 0.9];
const NORMAL_SPEED = [1.0];
const FAST_SPEEDS = [1.1, 1.25, 1.5, 2.0];

const PlaybackSpeedDrawer = ({ open, currentRate, onClose, onRateChange }: PlaybackSpeedDrawerProps) => {
  const { t } = useTranslation();
  const [customRate, setCustomRate] = useState(currentRate);

  // Sync with current rate when it changes (adjusted during render, not in an effect)
  const [syncedRate, setSyncedRate] = useState(currentRate);
  if (currentRate !== syncedRate) {
    setSyncedRate(currentRate);
    setCustomRate(currentRate);
  }

  const handlePresetClick = (rate: number) => {
    onRateChange(rate);
    setCustomRate(rate);
    onClose(); // Close drawer after preset selection
  };

  const column = (label: string, speeds: number[]) => (
    <Stack align="center" gap={4}>
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      {speeds.map((speed) => {
        const selected = Math.abs(currentRate - speed) < 0.01;
        return (
          <Button
            key={speed}
            variant={selected ? 'filled' : 'subtle'}
            color={selected ? undefined : 'gray'}
            onClick={() => handlePresetClick(speed)}
            size="xs"
            fullWidth
            maw={100}
            miw={80}
          >
            {speed}x
          </Button>
        );
      })}
    </Stack>
  );

  return (
    <Drawer
      position="bottom"
      opened={open}
      onClose={onClose}
      size="auto"
      title={t('speed.title')}
    >
      <Box
        // Space would toggle playback (global shortcut)
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {/* Slider */}
        <Box mb="xl" px="xs">
          <Text size="sm" fw={600} mb="xs">
            {t('speed.custom')}: {customRate.toFixed(2)}x
          </Text>
          <Slider
            value={customRate * 100}
            onChange={(value) => setCustomRate(value / 100)}
            onChangeEnd={(value) => onRateChange(value / 100)}
            min={50}
            max={200}
            step={5}
            marks={[{ value: 100, label: '1x' }]}
            label={(value) => `${(value / 100).toFixed(2)}x`}
          />
        </Box>

        {/* Preset speeds in three columns */}
        <Text size="sm" fw={600} c="dimmed" mb="xs">
          {t('speed.presets')}
        </Text>
        <SimpleGrid cols={3} spacing="md">
          {column(t('speed.slower'), SLOW_SPEEDS)}
          {column(t('speed.normal'), NORMAL_SPEED)}
          {column(t('speed.faster'), FAST_SPEEDS)}
        </SimpleGrid>
      </Box>
    </Drawer>
  );
};

export default PlaybackSpeedDrawer;
