/**
 * Left / right balance of a track. Centered by default, the center is
 * magnetic, a double click goes back to it. On touch screens a small slider
 * is too hard to set: a button shows the position and opens a panel with a
 * large slider, - / + steps and a center button.
 */

import { useRef, useState } from 'react';
import { ActionIcon, Button, Group, Popover, Slider, Stack, Text, Tooltip } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useThrottle } from '../hooks/useThrottle';
import { useWheelAdjust } from '../hooks/useWheelAdjust';
import { useMedia } from '../theme/palette';
import type { AudioTrack } from '../types/audio';

/** Within this distance (%), the slider snaps to the center */
const CENTER_SNAP = 4;
/** - / + buttons and wheel step (%) */
const STEP = 5;

const snap = (percent: number) => (Math.abs(percent) < CENTER_SNAP ? 0 : percent);

export default function PanSlider({ track }: { track: AudioTrack }) {
  const { t } = useTranslation();
  const setPan = useAudioStore((s) => s.setPan);
  const touch = useMedia('(pointer: coarse)');
  const [dragPan, setDragPan] = useState<number | null>(null);
  // A double click resets: the moves of its own clicks (throttled, or ending
  // after it) must not land after the reset
  const resetAt = useRef(0);
  const moveTo = (value: number) => {
    if (Date.now() - resetAt.current > 200) setPan(track.id, value);
  };
  const throttledMoveTo = useThrottle(moveTo, 50);

  const percent = dragPan ?? (track.pan ?? 0) * 100;
  const stepBy = (steps: number) => {
    const current = (useAudioStore.getState().tracks.find((x) => x.id === track.id)?.pan ?? 0) * 100;
    setPan(track.id, Math.max(-100, Math.min(100, Math.round(current / STEP + steps) * STEP)) / 100);
  };
  const wheelRef = useWheelAdjust<HTMLDivElement>(stepBy);

  const format = (value: number) => {
    const n = Math.round(Math.abs(value));
    if (n === 0) return t('track.panCenter');
    return value < 0 ? t('track.panLeft', { n }) : t('track.panRight', { n });
  };

  const sliderProps = {
    value: percent,
    min: -100,
    max: 100,
    onChange: (v: number) => {
      setDragPan(snap(v));
      throttledMoveTo(snap(v) / 100);
    },
    onChangeEnd: (v: number) => {
      moveTo(snap(v) / 100);
      setDragPan(null);
    },
    color: track.color,
    thumbLabel: t('track.pan'),
    // The position says it all: no fill from the left
    styles: { bar: { display: 'none' } },
  };

  if (touch) {
    return (
      <Popover position="bottom" shadow="md" withArrow>
        <Popover.Target>
          <Button variant="subtle" color="gray" size="compact-xs" miw={40} px={4} aria-label={t('track.pan')} data-pan-button>
            {format(percent)}
          </Button>
        </Popover.Target>
        <Popover.Dropdown p="md">
          <Stack gap="md" w={260} maw="calc(100vw - 32px)">
            <Group justify="space-between">
              <Text fw={600}>{t('track.pan')}</Text>
              <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{format(percent)}</Text>
            </Group>
            <Slider
              {...sliderProps}
              size="lg"
              label={null}
              marks={[
                { value: -100, label: t('track.panLeftEnd') },
                { value: 0, label: t('track.panCenter') },
                { value: 100, label: t('track.panRightEnd') },
              ]}
              mb="md"
              data-pan-slider
            />
            <Group justify="space-between" wrap="nowrap">
              <ActionIcon variant="default" size="lg" onClick={() => stepBy(-1)} aria-label={t('track.panToLeft')}>
                <IconMinus size={18} />
              </ActionIcon>
              <Button variant="light" onClick={() => setPan(track.id, 0)} disabled={percent === 0}>
                {t('track.panReset')}
              </Button>
              <ActionIcon variant="default" size="lg" onClick={() => stepBy(1)} aria-label={t('track.panToRight')}>
                <IconPlus size={18} />
              </ActionIcon>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    );
  }

  return (
    <Tooltip label={`${t('track.pan')} : ${format(percent)}`} disabled={dragPan !== null}>
      <Slider
        {...sliderProps}
        ref={wheelRef}
        marks={[{ value: 0 }]}
        onDoubleClick={() => {
          resetAt.current = Date.now();
          setPan(track.id, 0);
        }}
        label={format}
        size="xs"
        data-pan-slider
        w={56}
        mx={4}
      />
    </Tooltip>
  );
}
