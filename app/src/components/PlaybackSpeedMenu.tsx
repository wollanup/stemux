import { useState } from 'react';
import { Button, Popover, SimpleGrid, Slider, Stack, Text } from '@mantine/core';
import { IconGauge } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface PlaybackSpeedMenuProps {
  currentRate: number;
  disabled: boolean;
  onRateChange: (rate: number) => void;
}

const SLOW_SPEEDS = [0.5, 0.7, 0.8, 0.9];
const NORMAL_SPEED = [1.0];
const FAST_SPEEDS = [1.1, 1.25, 1.5, 2.0];

/** Speed button and its small panel: presets and a slider for any speed */
const PlaybackSpeedMenu = ({ currentRate, disabled, onRateChange }: PlaybackSpeedMenuProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
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
    setOpened(false); // Close after a preset, like a menu
  };

  const column = (label: string, speeds: number[]) => (
    <Stack gap={2} align="stretch">
      <Text size="xs" c="dimmed" ta="center">
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
            size="compact-sm"
          >
            {speed}x
          </Button>
        );
      })}
    </Stack>
  );

  return (
    <Popover opened={opened} onChange={setOpened} position="top-end" shadow="md" width={260}>
      <Popover.Target>
        <Button
          leftSection={<IconGauge size={18} />}
          disabled={disabled}
          variant="outline"
          size="xs"
          miw={100}
        >
          {currentRate.toFixed(2)}x
        </Button>
      </Popover.Target>
      <Popover.Dropdown
        // Space would toggle playback (global shortcut)
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <Text size="xs" c="dimmed" mb={4}>
          {t('speed.custom')}: {customRate.toFixed(2)}x
        </Text>
        <Slider
          value={customRate * 100}
          onChange={(value) => setCustomRate(value / 100)}
          onChangeEnd={(value) => onRateChange(value / 100)}
          min={50}
          max={200}
          step={5}
          size="sm"
          marks={[{ value: 100 }]}
          label={(value) => `${(value / 100).toFixed(2)}x`}
          mb="md"
        />
        <SimpleGrid cols={3} spacing="xs">
          {column(t('speed.slower'), SLOW_SPEEDS)}
          {column(t('speed.normal'), NORMAL_SPEED)}
          {column(t('speed.faster'), FAST_SPEEDS)}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
};

export default PlaybackSpeedMenu;
