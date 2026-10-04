import { useState } from 'react';
import { ActionIcon, Button, Group, Popover, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconClef, IconMinus, IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useWheelAdjust } from '../hooks/useWheelAdjust';
import { CENTS_RANGE, PITCH_RANGE, NO_PITCH_SHIFT, isPitchShifted, type PitchShift } from '../audio/pitch';
import { useSmallerThan } from '../theme/palette';

/** Cents moved by the - / + buttons and a wheel step */
const CENTS_STEP = 5;

const signed = (value: number) => (value > 0 ? `+${value}` : String(value).replace('-', '−'));

/** "+2", "+2 −30¢", "−30¢", "0" */
const formatPitch = ({ semitones, cents }: PitchShift) => {
  if (cents === 0) return signed(semitones);
  return semitones === 0 ? `${signed(cents)}¢` : `${signed(semitones)} ${signed(cents)}¢`;
};

interface StepperProps {
  value: number;
  unit: string;
  onChange: (value: number) => void;
  step: number;
  /** Bound either way: - / + are disabled there */
  limit: number;
  downLabel: string;
  upLabel: string;
  inputLabel: string;
}

/** - / typed value / +, the wheel over it steps too */
const Stepper = ({ value, unit, onChange, step, limit, downLabel, upLabel, inputLabel }: StepperProps) => {
  const [text, setText] = useState<string | null>(null);
  const wheelRef = useWheelAdjust<HTMLDivElement>((steps) => onChange(value + steps * step));

  const commit = () => {
    if (text === null) return;
    const typed = Math.round(Number(text.replace('−', '-').replace(',', '.')));
    if (text.trim() !== '' && Number.isFinite(typed)) onChange(typed);
    setText(null);
  };

  return (
    <Group gap={4} wrap="nowrap" ref={wheelRef}>
      <ActionIcon variant="subtle" color="gray" aria-label={downLabel} disabled={value <= -limit} onClick={() => onChange(value - step)}>
        <IconMinus size={18} />
      </ActionIcon>
      <TextInput
        size="sm"
        w={70}
        value={text ?? signed(value)}
        onChange={(e) => setText(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        inputMode="numeric"
        aria-label={inputLabel}
        styles={{ input: { textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }}
      />
      <ActionIcon variant="subtle" color="gray" aria-label={upLabel} disabled={value >= limit} onClick={() => onChange(value + step)}>
        <IconPlus size={18} />
      </ActionIcon>
      <Text size="sm" c="dimmed">
        {unit}
      </Text>
    </Group>
  );
};

/** Pitch button and its small panel: semitones to transpose, cents to fine tune */
const PitchMenu = ({ disabled }: { disabled: boolean }) => {
  const { t } = useTranslation();
  const pitch = useAudioStore((s) => s.pitch);
  const setPitch = useAudioStore((s) => s.setPitch);
  const { semitones, cents } = pitch;
  const shifted = isPitchShifted(pitch);
  const [opened, setOpened] = useState(false);
  // The bottom bar is full on phones: icon only, filled when shifted (the value is in the panel)
  const compact = useSmallerThan('xs');

  return (
    <Popover opened={opened} onChange={setOpened} position="top-end" shadow="md" trapFocus returnFocus>
      <Popover.Target>
        <Tooltip label={t('pitch.title')} disabled={opened}>
          <Button
            onClick={() => setOpened((o) => !o)}
            leftSection={compact ? undefined : <IconClef size={18} />}
            disabled={disabled}
            variant={shifted ? 'filled' : 'outline'}
            size="xs"
            miw={compact ? undefined : 70}
            px={compact ? 6 : undefined}
            aria-label={t('pitch.title')}
            data-pitch-button
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {compact ? <IconClef size={18} /> : formatPitch(pitch)}
          </Button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown
        p="md"
        // Space would toggle playback (global shortcut)
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <Stack gap="sm" data-pitch-panel>
          <Group justify="space-between">
            <Text fw={600}>{t('pitch.title')}</Text>
            {compact && shifted && <Text size="sm">{formatPitch(pitch)}</Text>}
          </Group>
          <Stepper
            value={semitones}
            unit={t('pitch.semitones')}
            step={1}
            limit={PITCH_RANGE}
            onChange={(value) => setPitch({ semitones: value, cents })}
            downLabel={t('pitch.semitoneDown')}
            upLabel={t('pitch.semitoneUp')}
            inputLabel={t('pitch.semitonesInput')}
          />
          <Stepper
            value={cents}
            unit={t('pitch.cents')}
            step={CENTS_STEP}
            limit={CENTS_RANGE}
            onChange={(value) => setPitch({ semitones, cents: value })}
            downLabel={t('pitch.centsDown', { step: CENTS_STEP })}
            upLabel={t('pitch.centsUp', { step: CENTS_STEP })}
            inputLabel={t('pitch.centsInput')}
          />
          <Text size="xs" c="dimmed">
            {t('pitch.hint')}
          </Text>
          <Button variant="subtle" size="compact-sm" disabled={!shifted} onClick={() => setPitch(NO_PITCH_SHIFT)}>
            {t('pitch.reset')}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

export default PitchMenu;
