/**
 * Effects of a recording track. A click outside closes the panel, except on
 * the transport bar: play / pause stay usable to adjust while listening.
 */

import { useEffect, useRef, useState } from 'react';
import { ActionIcon, CloseButton, Group, Popover, Slider, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useThrottle } from '../hooks/useThrottle';
import { useWheelAdjust } from '../hooks/useWheelAdjust';
import type { AudioTrack } from '../types/audio';

interface TrackFxProps {
  track: AudioTrack;
  variant: 'column' | 'row';
}

export default function TrackFx({ track, variant }: TrackFxProps) {
  const { t } = useTranslation();
  const setReverb = useAudioStore((s) => s.setReverb);
  const updateTrack = useAudioStore((s) => s.updateTrack);
  const [opened, setOpened] = useState(false);
  const [dragReverb, setDragReverb] = useState<number | null>(null);
  const throttledSetReverb = useThrottle((id: string, value: number) => setReverb(id, value), 50);
  const targetRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const reverb = track.reverb ?? 0;
  const reverbOn = track.reverbEnabled ?? true;
  const active = reverbOn && reverb > 0;

  // Wheel over the slider: 2% per step
  const reverbWheelRef = useWheelAdjust<HTMLDivElement>((steps) => {
    const current = useAudioStore.getState().tracks.find((x) => x.id === track.id)?.reverb ?? 0;
    setReverb(track.id, Math.max(0, Math.min(1, Math.round((current + steps * 0.02) * 100) / 100)));
  }, reverbOn);

  useEffect(() => {
    if (!opened) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (dropdownRef.current?.contains(target) || targetRef.current?.contains(target)) return;
      if (target.closest('[data-transport]')) return;
      setOpened(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [opened]);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      // Below: on the right it would hide the arm button
      position={variant === 'column' ? 'bottom-start' : 'bottom-end'}
      shadow="md"
      withArrow
      closeOnClickOutside={false}
      trapFocus={false}
      returnFocus={false}
    >
      <Popover.Target>
        <Tooltip label={t('fx.title')} disabled={opened}>
          <ActionIcon
            ref={targetRef}
            variant={opened ? 'filled' : active ? 'light' : 'subtle'}
            color={opened || active ? undefined : 'gray'}
            aria-label={t('fx.title')}
            aria-expanded={opened}
            onClick={() => setOpened((o) => !o)}
            fw={700}
            fz={11}
          >
            FX
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown ref={dropdownRef} p="md" data-fx-panel>
        <Stack gap="sm" w={280} maw="calc(100vw - 32px)">
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text fw={600} truncate>
              {t('fx.titleFor', { name: track.name })}
            </Text>
            <CloseButton size="sm" onClick={() => setOpened(false)} aria-label={t('fx.close')} />
          </Group>

          <div>
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Switch
                size="xs"
                label={t('fx.reverb')}
                checked={reverbOn}
                onChange={(e) => updateTrack(track.id, { reverbEnabled: e.currentTarget.checked })}
                styles={{ label: { fontWeight: 500 } }}
              />
              <Text size="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(dragReverb ?? reverb * 100)} %
              </Text>
            </Group>
            <Slider
              ref={reverbWheelRef}
              value={dragReverb ?? reverb * 100}
              onChange={(value) => {
                setDragReverb(value);
                throttledSetReverb(track.id, value / 100);
              }}
              onChangeEnd={(value) => {
                setReverb(track.id, value / 100);
                setDragReverb(null);
              }}
              disabled={!reverbOn}
              label={null}
              color={track.color}
              aria-label={t('fx.reverb')}
            />
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
