import { useState, type ReactNode } from 'react';
import { ActionIcon, Badge, CloseButton, Group, Menu, Stack, Text, UnstyledButton, type BadgeVariant } from '@mantine/core';
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDotsVertical,
  IconLogin,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRepeat,
  IconTrash,
} from '@tabler/icons-react';
import { useAudioStore } from '../hooks/useAudioStore';
import { LOOP_COLORS, loopColor, markerColor } from '../utils/colors';
import ColorPalette, { ColorDot } from './ColorPalette';
import {logger} from '../utils/logger';
import { useTranslation } from 'react-i18next';
import classes from './MarkersPanel.module.css';

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Chip buttons: menu (⋮) and delete (×), without triggering the chip itself
 * (events from the menu, rendered in a portal, bubble through React too)
 */
const ChipActions = ({ menu, onDelete, menuLabel, deleteLabel, wrapMenu = (node) => node }: {
  menu: ReactNode;
  onDelete: () => void;
  menuLabel: string;
  deleteLabel: string;
  /** Wraps the ⋮ button, for a popover anchored to it */
  wrapMenu?: (node: ReactNode) => ReactNode;
}) => (
  <Group gap={0} wrap="nowrap" onPointerDown={stopPropagation} onClick={stopPropagation} onKeyDown={stopPropagation}>
    {wrapMenu(
      <Menu position="bottom-start" shadow="md">
        <Menu.Target>
          <ActionIcon variant="transparent" size="sm" c="inherit" aria-label={menuLabel}>
            <IconDotsVertical size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>{menu}</Menu.Dropdown>
      </Menu>
    )}
    <CloseButton size="sm" variant="transparent" c="inherit" aria-label={deleteLabel} data-delete-chip onClick={onDelete} />
  </Group>
);

/** Count in a small grey badge */
const CountBadge = ({ count, testId }: { count: number; testId: string }) => (
  <Badge data-testid={testId} variant="light" color="gray" circle>
    {count}
  </Badge>
);

/**
 * Clickable badge (a div: it holds buttons). Enter / Space activate it,
 * Delete / Backspace delete it.
 */
const Chip = ({ icon, label, actions, onActivate, onDelete, variant, color, dashed, ...rest }: {
  icon: ReactNode;
  label: string;
  actions: ReactNode;
  onActivate: () => void;
  onDelete: () => void;
  variant: BadgeVariant;
  color: string;
  dashed?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'onKeyDown' | 'children' | 'color'> & Record<`data-${string}`, unknown>) => (
  <Badge
    component="div"
    role="button"
    tabIndex={0}
    size="lg"
    tt="none"
    variant={variant}
    color={color}
    autoContrast
    leftSection={icon}
    rightSection={actions}
    className={classes.chip}
    data-dashed={dashed || undefined}
    onClick={onActivate}
    onKeyDown={(e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete();
      }
    }}
    {...rest}
  >
    {label}
  </Badge>
);

const MarkersPanel = () => {
  const { t } = useTranslation();
  const { loopState, removeMarker, removeLoop, seek, createLoop, setActiveLoop, play, toggleLoopPlayback, armLoop, setLoopColor } = useAudioStore();
  const isPlaying = useAudioStore((s) => s.playbackState.isPlaying);
  const armedLoopId = useAudioStore((s) => s.armedLoopId);
  const panelOpen = useAudioStore((s) => s.loopsPanelOpen);
  const setLoopsPanelOpen = useAudioStore((s) => s.setLoopsPanelOpen);
  const [loopStartMarker, setLoopStartMarker] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [colorLoopId, setColorLoopId] = useState<string | null>(null);

  const handleMarkerClick = (time: number) => {
    // Disable loop when clicking on a marker (cleaner UX)
    if (loopState.activeLoopId) {
      setActiveLoop(null);
    }
    
    seek(time);
    play();
  };

  const handleLoopEndpoint = (markerId: string) => {
    if (loopStartMarker === null) {
      // First click: set as loop start
      setLoopStartMarker(markerId);
      logger.debug('🔁 Loop start marker set:', markerId);
    } else if (loopStartMarker === markerId) {
      // Same marker clicked twice: cancel
      setLoopStartMarker(null);
      logger.debug('❌ Loop start marker cancelled');
    } else {
      // Second click: create loop
      const markers = [...loopState.markers].sort((a, b) => a.time - b.time);
      const startIdx = markers.findIndex(m => m.id === loopStartMarker);
      const endIdx = markers.findIndex(m => m.id === markerId);
      
      const [start, end] = startIdx < endIdx 
        ? [loopStartMarker, markerId]
        : [markerId, loopStartMarker];
      
      // Check if identical loop already exists
      const existingLoop = loopState.loops.find(
        l => l.startMarkerId === start && l.endMarkerId === end
      );
      
      if (existingLoop) {
        logger.debug('⚠️ Identical loop already exists, skipping creation');
      } else {
        createLoop(start, end);
        logger.debug('✅ Loop created:', start, '→', end);
      }
      
      setLoopStartMarker(null);
    }
  };

  const handleDelete = (markerId: string) => {
    removeMarker(markerId);
    if (loopStartMarker === markerId) {
      setLoopStartMarker(null);
    }
  };

  const handlePointerDown = (_e: React.PointerEvent, markerId: string) => {
    const timer = window.setTimeout(() => {
      // Long press detected
      handleLoopEndpoint(markerId);
      setLongPressTimer(null);
    }, 500); // 500ms for long press
    setLongPressTimer(timer);
  };

  const handlePointerUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Disabling the loop without pausing lets playback run past its end
  const handleContinueAfterLoop = () => {
    setActiveLoop(null);
  };

  // Loops once the playhead gets in; a second click cancels
  const handleLoopOnEntry = (loopId: string) => {
    armLoop(armedLoopId === loopId ? null : loopId);
  };

  const isLoopPlaying = (loopId: string) =>
    isPlaying && loopState.activeLoopId === loopId && loopState.loops.some((l) => l.id === loopId && l.enabled);

  const loopColorOf = (loopId: string) => {
    const loop = loopState.loops.find((l) => l.id === loopId);
    return loop ? loopColor(loop, loopState.loops) : LOOP_COLORS[0];
  };

  const getMarkerNumber = (markerId: string) => {
    const index = loopState.markers.findIndex(m => m.id === markerId);
    return index !== -1 ? index + 1 : '?';
  };

  // Hidden: one thin row with the counts, a click shows the lists again
  if (!panelOpen) {
    return (
      <UnstyledButton
        onClick={() => setLoopsPanelOpen(true)}
        aria-label={t('markers.showPanel')}
        aria-expanded={false}
        data-loops-panel="closed"
        className={classes.panel}
      >
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            {t('markers.markersTitle')}
          </Text>
          <CountBadge count={loopState.markers.length} testId="markers-count" />
          <Text size="sm" c="dimmed" ml="xs">
            {t('markers.loopsTitle')}
          </Text>
          <CountBadge count={loopState.loops.length} testId="loops-count" />
          <IconChevronDown size={18} color="var(--mantine-color-dimmed)" style={{ marginLeft: 'auto' }} />
        </Group>
      </UnstyledButton>
    );
  }

  return (
    <Stack data-loops-panel="open" gap="xs" className={classes.panel}>
      {/* Markers Section */}
      <Group gap="xs">
        <Text size="sm" c="dimmed" mr="xs">
          {t('markers.markers')}
        </Text>
        {loopState.markers.length === 0 && (
          <Text size="sm" c="dimmed" fs="italic">
            {t('markers.emptyHint')}
          </Text>
        )}
        {loopState.markers.map((marker, index) => {
          const isInActiveLoop = loopState.loops.find(
            l => l.enabled && (l.startMarkerId === marker.id || l.endMarkerId === marker.id)
          );

          const isLoopEndpoint = loopState.loops.some(
            l => l.startMarkerId === marker.id || l.endMarkerId === marker.id
          );

          const isLoopStartSelection = loopStartMarker === marker.id;
          const color = markerColor(marker.id, loopState);

          // Loop ends take the color of their loop: filled while it plays
          const variant: BadgeVariant = isInActiveLoop || isLoopStartSelection ? 'filled' : isLoopEndpoint ? 'outline' : 'light';
          const chipColor = isLoopStartSelection ? 'orange' : isLoopEndpoint ? color : 'gray';

          return (
            <Chip
              key={marker.id}
              data-marker-chip={marker.id}
              icon={<IconPlayerPlayFilled size={14} />}
              label={`${index + 1} - ${formatTime(marker.time)}`}
              variant={variant}
              color={chipColor}
              onActivate={() => handleMarkerClick(marker.time)}
              onDelete={() => handleDelete(marker.id)}
              onPointerDown={(e) => handlePointerDown(e, marker.id)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              actions={
                <ChipActions
                  menuLabel={t('markers.markerMenu')}
                  deleteLabel={t('markers.deleteMarker')}
                  onDelete={() => handleDelete(marker.id)}
                  menu={
                    <>
                      <Menu.Item leftSection={<IconRepeat size={16} />} onClick={() => handleLoopEndpoint(marker.id)}>
                        {loopStartMarker === marker.id ? t('markers.cancelLoopStart') :
                         loopStartMarker ? t('markers.setLoopEnd') : t('markers.setLoopStart')}
                      </Menu.Item>
                      <Menu.Item leftSection={<IconTrash size={16} />} onClick={() => handleDelete(marker.id)}>
                        {t('markers.deleteMarker')}
                      </Menu.Item>
                    </>
                  }
                />
              }
            />
          );
        })}

        {/* Hide the lists: the loop strip becomes thin and read-only */}
        <ActionIcon variant="subtle" color="gray" onClick={() => setLoopsPanelOpen(false)} aria-label={t('markers.hidePanel')} aria-expanded ml="auto">
          <IconChevronUp size={18} />
        </ActionIcon>
      </Group>

      {/* Loops Section */}
      {loopState.loops.length > 0 && (
        <Group gap="xs">
          <Text size="sm" c="dimmed" mr="xs">
            {t('markers.loops')}
          </Text>
          {loopState.loops.map((loop) => {
            const startNum = getMarkerNumber(loop.startMarkerId);
            const endNum = getMarkerNumber(loop.endMarkerId);
            const isActive = loop.enabled;
            const isPlayingLoop = isLoopPlaying(loop.id);
            const isArmed = armedLoopId === loop.id;
            const color = loopColor(loop, loopState.loops);

            return (
              <Chip
                key={loop.id}
                data-loop-chip={loop.id}
                data-armed={isArmed || undefined}
                aria-label={isPlayingLoop ? t('markers.pauseLoop') : t('markers.playLoop')}
                // Colored like the loop in the ruler: filled when active, dashed when armed
                variant={isActive ? 'filled' : 'outline'}
                color={color}
                dashed={isArmed}
                label={`${startNum} → ${endNum}`}
                onActivate={() => toggleLoopPlayback(loop.id)}
                onDelete={() => removeLoop(loop.id)}
                icon={
                  isPlayingLoop ? (
                    // Playing: equalizer bars bounce; hovering shows what a click does (pause)
                    <span className={classes.playingIcon}>
                      <span className={classes.loopPlaying} aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                      <IconPlayerPauseFilled size={14} className={classes.loopPause} />
                    </span>
                  ) : isArmed ? (
                    <IconLogin size={14} />
                  ) : (
                    <IconRepeat size={14} />
                  )
                }
                actions={
                  <ChipActions
                    menuLabel={t('markers.loopMenu')}
                    deleteLabel={t('markers.deleteLoop')}
                    onDelete={() => removeLoop(loop.id)}
                    wrapMenu={(node) => (
                      <ColorPalette
                        opened={colorLoopId === loop.id}
                        colors={LOOP_COLORS}
                        value={loopColorOf(loop.id)}
                        onSelect={(c) => setLoopColor(loop.id, c)}
                        onClose={() => setColorLoopId(null)}
                      >
                        {node}
                      </ColorPalette>
                    )}
                    menu={
                      <>
                        {isPlayingLoop && (
                          <Menu.Item leftSection={<IconArrowRight size={16} />} onClick={handleContinueAfterLoop}>
                            {t('markers.continueAfterLoop')}
                          </Menu.Item>
                        )}
                        {/* Not for the enabled loop: the playhead is already in it */}
                        {!loop.enabled && (
                          <Menu.Item
                            leftSection={<IconLogin size={16} />}
                            rightSection={isArmed ? <IconCheck size={16} /> : undefined}
                            onClick={() => handleLoopOnEntry(loop.id)}
                          >
                            {t('markers.loopOnEntry')}
                          </Menu.Item>
                        )}
                        <Menu.Item leftSection={<ColorDot color={color} />} onClick={() => setColorLoopId(loop.id)}>
                          {t('colors.title')}
                        </Menu.Item>
                        <Menu.Item leftSection={<IconTrash size={16} />} onClick={() => removeLoop(loop.id)}>
                          {t('markers.deleteLoop')}
                        </Menu.Item>
                      </>
                    }
                  />
                }
              />
            );
          })}
        </Group>
      )}
    </Stack>
  );
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default MarkersPanel;
