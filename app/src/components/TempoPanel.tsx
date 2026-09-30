/**
 * Tempo of the piece: typed, tapped or detected, time signature, where bar 1
 * is, and whether the ruler counts seconds or bars.
 */

import { useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, AutoAwesome, ChevronLeft, ChevronRight, Delete, MusicNote, Place, Remove, TouchApp } from '@mui/icons-material';
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

export default function TempoPanel({ disabled, compact }: { disabled: boolean; compact: boolean }) {
  const { t } = useTranslation();
  const tempo = useAudioStore((s) => s.tempo);
  const rulerMode = useAudioStore((s) => s.rulerMode);
  const { setTempo, setRulerMode } = useAudioStore();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
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

  return (
    <>
      <Tooltip title={t('tempo.title')}>
        <span>
          <Button
            color={tempo ? 'primary' : 'inherit'}
            onClick={(e) => setAnchor(e.currentTarget)}
            disabled={disabled}
            startIcon={<MusicNote />}
            aria-label={t('tempo.title')}
            data-tempo-button
            sx={{ textTransform: 'none', minWidth: 0, mr: 0.5, whiteSpace: 'nowrap', '& .MuiButton-startIcon': compact && !label ? { m: 0 } : {} }}
          >
            {label}
          </Button>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => {
          commitBpm();
          setAnchor(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Stack spacing={2} sx={{ p: 2, width: 300, maxWidth: 'calc(100vw - 32px)' }} data-tempo-panel>
          <Typography variant="subtitle1" fontWeight={600}>
            {t('tempo.title')}
          </Typography>

          {/* BPM: typed, - / +, halved / doubled */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton size="small" aria-label={t('tempo.slower')} onClick={() => update({ bpm: clampBpm(Math.round(current.bpm) - 1) })}>
              <Remove fontSize="small" />
            </IconButton>
            <TextField
              size="small"
              value={bpmText ?? String(current.bpm)}
              onChange={(e) => setBpmText(e.target.value)}
              onBlur={commitBpm}
              onKeyDown={(e) => e.key === 'Enter' && commitBpm()}
              slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': t('tempo.bpm'), min: MIN_BPM, max: MAX_BPM, style: { textAlign: 'center' } } }}
              sx={{ width: 80 }}
            />
            <IconButton size="small" aria-label={t('tempo.faster')} onClick={() => update({ bpm: clampBpm(Math.round(current.bpm) + 1) })}>
              <Add fontSize="small" />
            </IconButton>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              BPM
            </Typography>
            <Button size="small" sx={{ minWidth: 0 }} onClick={() => update({ bpm: clampBpm(current.bpm / 2) })} aria-label={t('tempo.half')}>
              ÷2
            </Button>
            <Button size="small" sx={{ minWidth: 0 }} onClick={() => update({ bpm: clampBpm(current.bpm * 2) })} aria-label={t('tempo.double')}>
              ×2
            </Button>
          </Stack>

          {/* Tap and automatic detection */}
          <Stack direction="row" spacing={1}>
            <Tooltip title={t('tempo.tapHint')} placement="top">
              <Button variant="outlined" startIcon={<TouchApp />} onClick={onTap} sx={{ flex: 1 }}>
                {t('tempo.tap')}
                {tapCount > 1 ? ` (${tapCount})` : ''}
              </Button>
            </Tooltip>
            <Tooltip title={t('tempo.detectHint')} placement="top">
              <span style={{ flex: 1, display: 'flex' }}>
                <Button
                  variant="outlined"
                  startIcon={detecting ? <CircularProgress size={16} /> : <AutoAwesome />}
                  onClick={onDetect}
                  disabled={detecting}
                  sx={{ flex: 1 }}
                >
                  {t('tempo.detect')}
                </Button>
              </span>
            </Tooltip>
          </Stack>
          {message && (
            <Typography variant="body2" color="text.secondary" data-tempo-message>
              {message}
            </Typography>
          )}

          {/* Time signature */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {t('tempo.signature')}
            </Typography>
            <Select
              size="small"
              value={current.beatsPerBar}
              onChange={(e) => update({ beatsPerBar: Number(e.target.value) })}
              inputProps={{ 'aria-label': t('tempo.beatsPerBar') }}
            >
              {BEATS_PER_BAR.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </Select>
            <Typography>/</Typography>
            <Select
              size="small"
              value={current.beatUnit}
              onChange={(e) => update({ beatUnit: Number(e.target.value) })}
              inputProps={{ 'aria-label': t('tempo.beatUnit') }}
            >
              {BEAT_UNITS.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </Select>
          </Stack>

          {/* Bar 1 */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2">{t('tempo.barOne')}</Typography>
              <Typography variant="caption" color="text.secondary" data-tempo-offset>
                {formatSeconds(current.offset)}
              </Typography>
            </Box>
            <IconButton size="small" aria-label={t('tempo.earlier')} onClick={() => update({ offset: Math.max(0, current.offset - NUDGE_S) })}>
              <ChevronLeft fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label={t('tempo.later')} onClick={() => update({ offset: current.offset + NUDGE_S })}>
              <ChevronRight fontSize="small" />
            </IconButton>
            <Tooltip title={t('tempo.barOneHereHint')}>
              <Button size="small" startIcon={<Place />} onClick={() => update({ offset: audioEngine.getCurrentTime() })}>
                {t('tempo.barOneHere')}
              </Button>
            </Tooltip>
          </Stack>

          {/* Ruler */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {t('tempo.ruler')}
            </Typography>
            <ToggleButtonGroup size="small" exclusive value={rulerMode} onChange={(_, mode) => mode && setRulerMode(mode)}>
              <ToggleButton value="time">{t('tempo.rulerTime')}</ToggleButton>
              <ToggleButton value="bars" disabled={!tempo}>
                {t('tempo.rulerBars')}
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {tempo && (
            <Button
              color="error"
              size="small"
              startIcon={<Delete />}
              onClick={() => {
                setTempo(null);
                setRulerMode('time');
              }}
              sx={{ alignSelf: 'flex-start' }}
            >
              {t('tempo.remove')}
            </Button>
          )}
        </Stack>
      </Popover>
    </>
  );
}
