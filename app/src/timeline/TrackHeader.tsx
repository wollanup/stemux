/**
 * Track controls. `column`: left column next to the lane (large screens).
 * `row`: above the lane, full width (mobile / portrait).
 */

import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Menu, Slider, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconCircleFilled,
  IconDotsVertical,
  IconDownload,
  IconGripVertical,
  IconHeadphones,
  IconMicrophone,
  IconTrash,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import { useThrottle } from '../hooks/useThrottle';
import { useWheelAdjust } from '../hooks/useWheelAdjust';
import { getMic, subscribeMic } from '../audio/micSession';
import type { MicRecorder } from '../audio/MicRecorder';
import type { AudioTrack } from '../types/audio';
import { TRACK_COLORS } from '../utils/colors';
import ColorPalette, { ColorDot } from '../components/ColorPalette';
import ConfirmDialog from '../components/ConfirmDialog';
import PeakMeter, { PEAK_METER_WIDTH } from './PeakMeter';
import classes from './TrackHeader.module.css';

const ICON = 18;

interface TrackHeaderProps {
  track: AudioTrack;
  variant: 'column' | 'row';
  height?: number;
  dimmed: boolean;
  dragHandle: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners; isDragging: boolean };
}

/** Gap between the peak meter and the edge of the column: the width handle is there (px) */
const METER_RIGHT_PX = 8;

/** Input level of the armed track's microphone */
function LevelMeter() {
  const [recorder, setRecorder] = useState<MicRecorder | null>(getMic);
  const [level, setLevel] = useState(0);
  useEffect(() => subscribeMic(setRecorder), []);
  useEffect(() => {
    if (!recorder) return;
    return recorder.onLevel(setLevel);
  }, [recorder]);

  const db = level > 0 ? 20 * Math.log10(level) : -60;
  const percent = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  const color = level > 0.9 ? 'var(--app-error)' : level > 0.5 ? 'var(--app-warning)' : 'var(--app-success)';
  return (
    <div className={classes.levelMeter}>
      <div style={{ width: `${percent}%`, height: '100%', backgroundColor: color, transition: 'width 50ms linear' }} />
    </div>
  );
}

/** Short press: action; long press (500ms): alternative action */
function useLongPress(onShort: () => void, onLong: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 500);
    },
    onPointerUp: () => {
      window.clearTimeout(timer.current);
      if (!fired.current) onShort();
      fired.current = true;
    },
    onPointerCancel: () => {
      window.clearTimeout(timer.current);
      fired.current = true;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

export default function TrackHeader({ track, variant, height, dimmed, dragHandle }: TrackHeaderProps) {
  const { t } = useTranslation();
  const {
    setVolume,
    toggleMute,
    toggleSolo,
    exclusiveSolo,
    unmuteAll,
    removeTrack,
    updateTrack,
    toggleRecordArm,
    clearRecording,
  } = useAudioStore();
  const playbackRate = useAudioStore((state) => state.playbackState.playbackRate);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const throttledSetVolume = useThrottle((id: string, volume: number) => setVolume(id, volume), 50);

  // Wheel over the volume slider: 2% per step
  const volumeWheelRef = useWheelAdjust<HTMLDivElement>((steps) => {
    const current = useAudioStore.getState().tracks.find((t) => t.id === track.id);
    if (current) setVolume(track.id, Math.max(0, Math.min(1, Math.round((current.volume + steps * 0.02) * 100) / 100)));
  }, !track.isMuted);

  const isCollapsed = track.isCollapsed ?? false;
  const isRecording = track.recordingState === 'recording';

  const solo = useLongPress(
    () => {
      if (track.isMuted) toggleMute(track.id);
      toggleSolo(track.id);
    },
    () => exclusiveSolo(track.id)
  );
  const mute = useLongPress(
    () => {
      if (track.isSolo) toggleSolo(track.id);
      toggleMute(track.id);
    },
    () => unmuteAll()
  );

  const saveName = () => {
    updateTrack(track.id, { name: editedName.trim() || track.name });
    setIsEditingName(false);
  };

  const downloadRecording = () => {
    if (!track.file) return;
    const url = URL.createObjectURL(track.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = track.file.name || `${track.name}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const armDisabled = !!track.file || (playbackRate !== 1 && !track.isArmed);

  const nameRow = (
    <div className={classes.row}>
      <ActionIcon
        variant="subtle"
        color="gray"
        {...dragHandle.attributes}
        {...dragHandle.listeners}
        className={classes.dragHandle}
        style={{ cursor: dragHandle.isDragging ? 'grabbing' : 'grab' }}
        aria-label="Drag to reorder"
      >
        <IconGripVertical size={ICON} />
      </ActionIcon>

      {isEditingName ? (
        <TextInput
          value={editedName}
          onChange={(e) => setEditedName(e.currentTarget.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName();
            else if (e.key === 'Escape') setIsEditingName(false);
          }}
          autoFocus
          size="xs"
          variant="unstyled"
          className={classes.nameInput}
        />
      ) : (
        <Text
          size="sm"
          fw={600}
          truncate
          title={track.name}
          onClick={() => {
            setEditedName(track.name.replace('.mp3', ''));
            setIsEditingName(true);
          }}
          className={classes.name}
        >
          {track.name.replace('.mp3', '')}
        </Text>
      )}

      {isRecording && <IconCircleFilled size={14} className={classes.blink} />}

      <ColorPalette
        opened={colorOpen}
        colors={TRACK_COLORS}
        value={track.color}
        onSelect={(color) => updateTrack(track.id, { color })}
        onClose={() => setColorOpen(false)}
      >
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={t('track.options')}>
              <IconDotsVertical size={ICON} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<ColorDot color={track.color} />} onClick={() => setColorOpen(true)}>
              {t('colors.title')}
            </Menu.Item>
            <Menu.Item leftSection={<IconTrash size={16} />} onClick={() => setDeleteDialogOpen(true)}>
              {t('track.delete')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </ColorPalette>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={() => updateTrack(track.id, { isCollapsed: !isCollapsed })}
        className={classes.collapse}
        style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
        aria-label={isCollapsed ? t('track.expand') : t('track.collapse')}
      >
        <IconChevronDown size={ICON} />
      </ActionIcon>
    </div>
  );

  const controlsRow = (
    <div className={classes.row} style={{ paddingLeft: 4 }}>
      <Tooltip label={t('track.solo')}>
        <ActionIcon variant={track.isSolo ? 'filled' : 'subtle'} color={track.isSolo ? undefined : 'gray'} aria-label={t('track.solo')} {...solo}>
          <IconHeadphones size={ICON} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t('track.mute')}>
        <ActionIcon variant={track.isMuted ? 'filled' : 'subtle'} color={track.isMuted ? 'red' : 'gray'} aria-label={t('track.mute')} {...mute}>
          {track.isMuted ? <IconVolumeOff size={ICON} /> : <IconVolume size={ICON} />}
        </ActionIcon>
      </Tooltip>

      {track.isArmed && !track.file ? (
        <LevelMeter />
      ) : (
        <Slider
          ref={volumeWheelRef}
          value={dragVolume ?? track.volume * 100}
          onChange={(value) => {
            setDragVolume(value);
            throttledSetVolume(track.id, value / 100);
          }}
          onChangeEnd={(value) => {
            setVolume(track.id, value / 100);
            setDragVolume(null);
          }}
          disabled={track.isMuted}
          size="sm"
          color={track.color}
          label={(value) => `${Math.round(value)}%`}
          className={classes.volume}
          style={{ maxWidth: variant === 'row' ? 200 : undefined }}
        />
      )}

      {track.isRecordable && (
        <>
          <Tooltip
            label={
              track.file
                ? t('recording.clearRecordingFirst')
                : playbackRate !== 1 && !track.isArmed
                  ? t('recording.normalSpeedRequired')
                  : t('recording.armTrack')
            }
          >
            <span className={classes.tooltipAnchor}>
              <ActionIcon
                variant={track.isArmed ? 'filled' : 'subtle'}
                color={track.isArmed ? 'red' : 'gray'}
                aria-label={t('recording.armTrack')}
                aria-pressed={!!track.isArmed}
                onClick={() => toggleRecordArm(track.id)}
                disabled={armDisabled}
              >
                {isRecording ? <IconCircleFilled size={14} /> : <IconMicrophone size={ICON} />}
              </ActionIcon>
            </span>
          </Tooltip>
          {track.file && (
            <>
              <Tooltip label={t('recording.clearRecording')}>
                <ActionIcon variant="subtle" color="gray" className={classes.hoverDanger} aria-label={t('recording.clearRecording')} onClick={() => clearRecording(track.id)}>
                  <IconTrash size={ICON} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t('recording.downloadRecording')}>
                <ActionIcon variant="subtle" color="gray" className={classes.hoverPrimary} aria-label={t('recording.downloadRecording')} onClick={downloadRecording}>
                  <IconDownload size={ICON} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div
      data-track-header
      data-variant={variant}
      data-armed={track.isArmed || undefined}
      data-dimmed={dimmed || undefined}
      className={classes.header}
      style={{
        height,
        // Column: room for the peak meter, clear of the width handle
        paddingRight: variant === 'column' ? PEAK_METER_WIDTH + METER_RIGHT_PX + 4 : 4,
        borderLeftColor: track.isMuted ? 'var(--app-disabled)' : track.color,
      }}
    >
      {nameRow}
      {!isCollapsed && controlsRow}
      {/* Desktop: peak meter just before the waveform */}
      {variant === 'column' && (
        <div style={{ position: 'absolute', top: 4, bottom: 4, right: METER_RIGHT_PX }}>
          <PeakMeter trackId={track.id} />
        </div>
      )}

      <ConfirmDialog
        opened={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          removeTrack(track.id);
          setDeleteDialogOpen(false);
        }}
        title={t('track.deleteConfirmTitle')}
        message={t('track.deleteConfirmMessage')}
        cancelLabel={t('track.cancelButton')}
        confirmLabel={t('track.deleteConfirmButton')}
      />
    </div>
  );
}
