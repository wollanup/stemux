import { useState, type ReactNode } from 'react';
import { ActionIcon, alpha, Menu, Text, UnstyledButton } from '@mantine/core';
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
  IconX,
} from '@tabler/icons-react';
import { useAudioStore } from '../hooks/useAudioStore';
import { LOOP_COLORS, loopColor, markerColor } from '../utils/colors';
import ColorPalette, { ColorDot } from './ColorPalette';
import {logger} from '../utils/logger';
import { useTranslation } from 'react-i18next';
import { contrastText } from '../theme/palette';
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
  <span className={classes.actions} onPointerDown={stopPropagation} onClick={stopPropagation} onKeyDown={stopPropagation}>
    {wrapMenu(
      <Menu position="bottom-start" shadow="md">
        <Menu.Target>
          <UnstyledButton aria-label={menuLabel} className={classes.action}>
            <IconDotsVertical size={16} />
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>{menu}</Menu.Dropdown>
      </Menu>
    )}
    <UnstyledButton aria-label={deleteLabel} data-delete-chip onClick={onDelete} className={`${classes.action} ${classes.deleteAction}`}>
      <IconX size={16} />
    </UnstyledButton>
  </span>
);

/** Count in a small grey pill, like the badges of app notifications */
const CountBadge = ({ count, testId }: { count: number; testId: string }) => (
  <span data-testid={testId} className={classes.count}>
    {count}
  </span>
);

/**
 * Clickable chip (a div: it holds buttons). Enter / Space activate it,
 * Delete / Backspace delete it.
 */
const Chip = ({ icon, children, onActivate, onDelete, colors, dashed, ...rest }: {
  icon: ReactNode;
  children: ReactNode;
  onActivate: () => void;
  onDelete: () => void;
  colors: Record<string, string>;
  dashed?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'onKeyDown' | 'children'> & Record<`data-${string}`, unknown>) => (
  <div
    role="button"
    tabIndex={0}
    className={classes.chip}
    data-dashed={dashed || undefined}
    style={colors as React.CSSProperties}
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
    <span className={classes.icon}>{icon}</span>
    <span className={classes.label}>{children}</span>
  </div>
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
        className={classes.collapsed}
      >
        <Text size="sm" c="dimmed" lh="20px">
          {t('markers.markersTitle')}
        </Text>
        <CountBadge count={loopState.markers.length} testId="markers-count" />
        <Text size="sm" c="dimmed" lh="20px" ml={8}>
          {t('markers.loopsTitle')}
        </Text>
        <CountBadge count={loopState.loops.length} testId="loops-count" />
        <IconChevronDown size={18} className={classes.collapsedChevron} />
      </UnstyledButton>
    );
  }

  return (
    <div data-loops-panel="open" className={classes.panel}>
      {/* Markers Section */}
      <div className={classes.section}>
        <Text size="sm" c="dimmed" mr={8}>
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

          // Loop ends take the color of their loop
          const colors: Record<string, string> = {
            '--chip-hover': isInActiveLoop ? alpha(color, 0.8) : 'var(--app-hover)',
          };
          if (isLoopEndpoint) Object.assign(colors, { '--chip-bg': 'transparent', '--chip-border': color, '--chip-icon': color });
          if (isInActiveLoop) Object.assign(colors, { '--chip-bg': color, '--chip-fg': contrastText(color), '--chip-icon': 'inherit' });
          if (isLoopStartSelection) Object.assign(colors, { '--chip-bg': 'var(--app-warning)', '--chip-fg': '#fff' });

          return (
            <Chip
              key={marker.id}
              data-marker-chip={marker.id}
              icon={<IconPlayerPlayFilled size={16} />}
              colors={colors}
              onActivate={() => handleMarkerClick(marker.time)}
              onDelete={() => handleDelete(marker.id)}
              onPointerDown={(e) => handlePointerDown(e, marker.id)}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <span>{`${index + 1} - ${formatTime(marker.time)}`}</span>
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
            </Chip>
          );
        })}

        {/* Hide the lists: the loop strip becomes thin and read-only */}
        <ActionIcon variant="subtle" color="gray" onClick={() => setLoopsPanelOpen(false)} aria-label={t('markers.hidePanel')} aria-expanded ml="auto">
          <IconChevronUp size={18} />
        </ActionIcon>
      </div>

      {/* Loops Section */}
      {loopState.loops.length > 0 && (
        <div className={classes.section}>
          <Text size="sm" c="dimmed" mr={8}>
            {t('markers.loops')}
          </Text>
          {loopState.loops.map((loop) => {
            const startNum = getMarkerNumber(loop.startMarkerId);
            const endNum = getMarkerNumber(loop.endMarkerId);
            const isActive = loop.enabled;
            const isPlayingLoop = isLoopPlaying(loop.id);
            const isArmed = armedLoopId === loop.id;
            const color = loopColor(loop, loopState.loops);

            // Colored like the loop in the ruler: filled when active, dashed when armed
            const colors: Record<string, string> = isActive
              ? { '--chip-bg': color, '--chip-fg': contrastText(color), '--chip-border': color, '--chip-icon': 'inherit', '--chip-hover': alpha(color, 0.8) }
              : { '--chip-bg': 'transparent', '--chip-border': color, '--chip-icon': color, '--chip-hover': alpha(color, 0.12) };

            return (
              <Chip
                key={loop.id}
                data-loop-chip={loop.id}
                data-armed={isArmed || undefined}
                aria-label={isPlayingLoop ? t('markers.pauseLoop') : t('markers.playLoop')}
                dashed={isArmed}
                colors={colors}
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
                      <IconPlayerPauseFilled size={16} className={classes.loopPause} />
                    </span>
                  ) : isArmed ? (
                    <IconLogin size={16} />
                  ) : (
                    <IconRepeat size={16} />
                  )
                }
              >
                <span>{`${startNum} → ${endNum}`}</span>
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
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default MarkersPanel;
