/**
 * Tempo of the piece: typed, tapped or detected, time signature, where bar 1
 * is, and whether the ruler counts seconds or bars.
 */

import { useRef, useState, type ReactNode } from 'react';
import { ActionIcon, Box, Button, Group, Loader, Popover, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconHandFinger,
  IconMapPin,
  IconMinus,
  IconMusic,
  IconPlus,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { audioEngine } from '../audio/AudioEngine';
import type { Tempo } from '../types/audio';
import { clampBpm, DEFAULT_TEMPO, MAX_BPM, MIN_BPM, offsetFromDownbeat } from '../tempo/tempo';
import { addTap, bpmFromTaps } from '../tempo/tapTempo';
import { detectPieceTempo } from '../tempo/detectFromTracks';

const BEATS_PER_BAR = [2, 3, 4, 5, 6, 7, 9, 12];
const BEAT_UNITS = [2, 4, 8];
/** Nudge of bar 1, in seconds */
const NUDGE_S = 0.01;

const formatSeconds = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

interface TempoPanelProps {
  disabled: boolean;
  compact: boolean;
  /** Opened from elsewhere (mobile menu): no button of its own, the panel shows under `children` */
  opened?: boolean;
  onClose?: () => void;
  children?: ReactNode;
}

export default function TempoPanel({ disabled, compact, opened, onClose, children }: TempoPanelProps) {
  const { t } = useTranslation();
  const tempo = useAudioStore((s) => s.tempo);
  const rulerMode = useAudioStore((s) => s.rulerMode);
  const { setTempo, setRulerMode } = useAudioStore();
  const [ownOpened, setOwnOpened] = useState(false);
  const controlled = opened !== undefined;
  const isOpen = controlled ? opened : ownOpened;
  const [bpmText, setBpmText] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const taps = useRef<{ wall: number[]; piece: number[] }>({ wall: [], piece: [] });
  const [tapCount, setTapCount] = useState(0);

  const current = tempo ?? DEFAULT_TEMPO;

  /** Any change creates the tempo; the first time, the ruler switches to bars */
  const update = (changes: Partial<Tempo>) => {
    if (!tempo) setRulerMode('bars');
    setTempo({ ...current, ...changes });
    setMessage(null);
  };

  const commitBpm = () => {
    if (bpmText === null) return;
    const bpm = Number(bpmText.replace(',', '.'));
    if (Number.isFinite(bpm) && bpm > 0) update({ bpm: clampBpm(bpm) });
    setBpmText(null);
  };

  const onTap = () => {
    const now = performance.now() / 1000;
    const wall = addTap(taps.current.wall, now);
    // Taps of the same series, in piece time (to align the grid while playing)
    const piece = wall.length === 1 ? [audioEngine.getCurrentTime()] : [...taps.current.piece, audioEngine.getCurrentTime()].slice(-wall.length);
    taps.current = { wall, piece };
    setTapCount(wall.length);
    const bpm = bpmFromTaps(wall);
    if (bpm === null) return;
    const changes: Partial<Tempo> = { bpm: clampBpm(Math.round(bpm * 10) / 10) };
    // While playing, the first tap of the series is taken as a bar start
    if (audioEngine.isPlaying()) changes.offset = offsetFromDownbeat(piece[0], { ...current, ...changes });
    update(changes);
  };

  const onDetect = async () => {
    setDetecting(true);
    setMessage(null);
    try {
      const result = await detectPieceTempo(current.beatsPerBar);
      if (!result) {
        setMessage(t('tempo.detectFailed'));
      } else {
        update({ bpm: result.bpm, offset: result.offset });
        setMessage(result.confidence < 0.3 ? t('tempo.detectedUnsure', { bpm: result.bpm }) : t('tempo.detected', { bpm: result.bpm }));
      }
    } finally {
      setDetecting(false);
    }
  };

  const label = tempo ? `${Math.round(tempo.bpm * 10) / 10}${compact ? '' : ' BPM'}` : compact ? '' : t('tempo.title');

  const close = () => {
    commitBpm();
    setOwnOpened(false);
    onClose?.();
  };

  return (
    <Popover opened={isOpen} onDismiss={close} position="bottom" shadow="md" trapFocus returnFocus>
      <Popover.Target>
        {controlled ? (
          <span style={{ display: 'inline-flex' }}>{children}</span>
        ) : (
          <span style={{ display: 'inline-flex', marginRight: 4 }}>
            <Tooltip label={t('tempo.title')}>
              <Button
                variant="subtle"
                color={tempo ? undefined : 'gray'}
                c={tempo ? undefined : 'var(--mantine-color-text)'}
                onClick={() => (ownOpened ? close() : setOwnOpened(true))}
                disabled={disabled}
                leftSection={<IconMusic size={20} />}
                aria-label={t('tempo.title')}
                data-tempo-button
                px={compact && !label ? 'xs' : undefined}
                styles={compact && !label ? { section: { marginInlineEnd: 0 } } : undefined}
              >
                {label}
              </Button>
            </Tooltip>
          </span>
        )}
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="md" w={300} maw="calc(100vw - 32px)" data-tempo-panel>
          <Text fw={600}>{t('tempo.title')}</Text>

          {/* BPM: typed, - / +, halved / doubled */}
          <Group gap={4} wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" aria-label={t('tempo.slower')} onClick={() => update({ bpm: clampBpm(Math.round(current.bpm) - 1) })}>
              <IconMinus size={18} />
            </ActionIcon>
            <TextInput
              size="sm"
              w={80}
              value={bpmText ?? String(current.bpm)}
              onChange={(e) => setBpmText(e.currentTarget.value)}
              onBlur={commitBpm}
              onKeyDown={(e) => e.key === 'Enter' && commitBpm()}
              inputMode="decimal"
              min={MIN_BPM}
              max={MAX_BPM}
              aria-label={t('tempo.bpm')}
              styles={{ input: { textAlign: 'center' } }}
            />
            <ActionIcon variant="subtle" color="gray" aria-label={t('tempo.faster')} onClick={() => update({ bpm: clampBpm(Math.round(current.bpm) + 1) })}>
              <IconPlus size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed" flex={1}>
              BPM
            </Text>
            <Button variant="subtle" size="compact-sm" onClick={() => update({ bpm: clampBpm(current.bpm / 2) })} aria-label={t('tempo.half')}>
              ÷2
            </Button>
            <Button variant="subtle" size="compact-sm" onClick={() => update({ bpm: clampBpm(current.bpm * 2) })} aria-label={t('tempo.double')}>
              ×2
            </Button>
          </Group>

          {/* Tap and automatic detection */}
          <Group gap="xs" grow>
            <Tooltip label={t('tempo.tapHint')} position="top">
              <Button variant="outline" leftSection={<IconHandFinger size={18} />} onClick={onTap}>
                {t('tempo.tap')}
                {tapCount > 1 ? ` (${tapCount})` : ''}
              </Button>
            </Tooltip>
            <Tooltip label={t('tempo.detectHint')} position="top">
              <Button
                variant="outline"
                leftSection={detecting ? <Loader size={16} /> : <IconSparkles size={18} />}
                // Not disabled while busy: it would lose the focus, and Escape would no longer close the panel
                onClick={() => !detecting && onDetect()}
                aria-busy={detecting}
              >
                {t('tempo.detect')}
              </Button>
            </Tooltip>
          </Group>
          {message && (
            <Text size="sm" c="dimmed" data-tempo-message>
              {message}
            </Text>
          )}

          {/* Time signature */}
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" flex={1}>
              {t('tempo.signature')}
            </Text>
            <Select
              size="sm"
              w={72}
              data={BEATS_PER_BAR.map(String)}
              value={String(current.beatsPerBar)}
              onChange={(value) => value && update({ beatsPerBar: Number(value) })}
              allowDeselect={false}
              aria-label={t('tempo.beatsPerBar')}
              // In the panel: a click on an option is not a click outside it
              comboboxProps={{ withinPortal: false }}
            />
            <Text>/</Text>
            <Select
              size="sm"
              w={72}
              data={BEAT_UNITS.map(String)}
              value={String(current.beatUnit)}
              onChange={(value) => value && update({ beatUnit: Number(value) })}
              allowDeselect={false}
              aria-label={t('tempo.beatUnit')}
              comboboxProps={{ withinPortal: false }}
            />
          </Group>

          {/* Bar 1 */}
          <Group gap={4} wrap="nowrap">
            <Box flex={1}>
              <Text size="sm">{t('tempo.barOne')}</Text>
              <Text size="xs" c="dimmed" data-tempo-offset>
                {formatSeconds(current.offset)}
              </Text>
            </Box>
            <ActionIcon variant="subtle" color="gray" aria-label={t('tempo.earlier')} onClick={() => update({ offset: Math.max(0, current.offset - NUDGE_S) })}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" aria-label={t('tempo.later')} onClick={() => update({ offset: current.offset + NUDGE_S })}>
              <IconChevronRight size={18} />
            </ActionIcon>
            <Tooltip label={t('tempo.barOneHereHint')}>
              <Button variant="subtle" size="compact-sm" leftSection={<IconMapPin size={16} />} onClick={() => update({ offset: audioEngine.getCurrentTime() })}>
                {t('tempo.barOneHere')}
              </Button>
            </Tooltip>
          </Group>

          {/* Ruler */}
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" flex={1}>
              {t('tempo.ruler')}
            </Text>
            <Button.Group>
              <Button
                size="xs"
                variant={rulerMode === 'time' ? 'filled' : 'default'}
                aria-pressed={rulerMode === 'time'}
                onClick={() => setRulerMode('time')}
              >
                {t('tempo.rulerTime')}
              </Button>
              <Button
                size="xs"
                variant={rulerMode === 'bars' ? 'filled' : 'default'}
                aria-pressed={rulerMode === 'bars'}
                disabled={!tempo}
                onClick={() => setRulerMode('bars')}
              >
                {t('tempo.rulerBars')}
              </Button>
            </Button.Group>
          </Group>

          {tempo && (
            <Button
              variant="subtle"
              color="red"
              size="compact-sm"
              leftSection={<IconTrash size={16} />}
              onClick={() => {
                setTempo(null);
                setRulerMode('time');
              }}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('tempo.remove')}
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
