import { useState } from 'react';
import { ActionIcon, Button, Group, Menu, Progress, Slider, Text, Tooltip } from '@mantine/core';
import {
  IconArrowsMove,
  IconChevronDown,
  IconDisc,
  IconDotsVertical,
  IconHandStop,
  IconHelpCircle,
  IconMagnet,
  IconMapPinOff,
  IconMicrophone,
  IconMoon,
  IconMusic,
  IconRefresh,
  IconSettings,
  IconSun,
  IconTrashX,
  IconWaveSine,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { StemuxIcon } from './StemuxIcon';
import TempoPanel from './TempoPanel';
import DeleteAllMarkersDialog from './DeleteAllMarkersDialog';
import { usePlaybackTime } from '../hooks/usePlaybackTime';
import { useAudioStore } from '../hooks/useAudioStore';
import type { PieceWithStats } from '../types/audio';

interface TopBarProps {
  hasLoadedTracks: boolean;
  zoomLevel: number;
  sliderValue: number;
  prefersDarkMode: boolean;
  isMobile: boolean;
  tracksCount: number;
  isPlaying: boolean;
  duration: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomChange: (value: number) => void;
  onSliderDragStart: (value: number) => void;
  onSliderDragEnd: () => void;
  onOpenHelp: () => void;
  onOpenThemeDialog: () => void;
  onOpenSettings: () => void;
  onOpenAudioSettings: () => void;
  onOpenDeleteAllDialog: () => void;
  onOpenPiecesManager: () => void;
}

const TopBar = ({
  hasLoadedTracks,
  zoomLevel,
  sliderValue,
  prefersDarkMode,
  isMobile,
  tracksCount,
  isPlaying,
  duration,
  onZoomOut,
  onZoomIn,
  onZoomChange,
  onSliderDragStart,
  onSliderDragEnd,
  onOpenHelp,
  onOpenThemeDialog,
  onOpenSettings,
  onOpenAudioSettings,
  onOpenDeleteAllDialog,
  onOpenPiecesManager,
}: TopBarProps) => {
  const { t } = useTranslation();
  const [recentPieces, setRecentPieces] = useState<PieceWithStats[]>([]);
  const [deleteMarkersOpen, setDeleteMarkersOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);
  const tempo = useAudioStore((s) => s.tempo);
  const isRecordingSupported = useAudioStore((s) => s.isRecordingSupported);
  const markerCount = useAudioStore((s) => s.loopState.markers.length);

  const { getRecentPieces, getCurrentPiece, loadPiece, currentPieceName, snapEnabled, setSnapEnabled, editMode, setEditMode } = useAudioStore();

  // Use live playback time hook (updates every 100ms)
  const currentTime = usePlaybackTime();
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Load pieces menu data when opening
  const handleOpenPiecesMenu = async () => {
    try {
      const [recent, current] = await Promise.all([
        getRecentPieces(10),
        getCurrentPiece(),
      ]);
      setRecentPieces(recent.filter(p => p.id !== current?.id));
    } catch (error) {
      console.error('Failed to load pieces menu:', error);
    }
  };

  const handleLoadPiece = async (id: string) => {
    try {
      await loadPiece(id);
    } catch (error) {
      console.error('Failed to load piece:', error);
    }
  };

  const mainMenu = (
    <Menu position="bottom-end" shadow="md" width={260}>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size="lg" aria-label={t('menu.title')}>
          <IconDotsVertical size={22} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {isMobile && (
          <>
            <Menu.Item
              disabled={!hasLoadedTracks}
              leftSection={<IconMusic size={16} />}
              onClick={() => setTempoOpen(true)}
            >
              {tempo ? `${t('tempo.title')} · ${Math.round(tempo.bpm * 10) / 10} BPM` : t('tempo.title')}
            </Menu.Item>
            <Menu.CheckboxItem
              checked={editMode}
              onChange={setEditMode}
              closeMenuOnClick
              disabled={!hasLoadedTracks}
              rightSection={editMode ? <IconArrowsMove size={16} /> : <IconHandStop size={16} />}
            >
              {t('timeline.editMode')}
            </Menu.CheckboxItem>
            <Menu.Divider />
          </>
        )}

        <Menu.Item leftSection={<IconDisc size={16} />} onClick={onOpenPiecesManager}>
          {t('menu.pieces')}
        </Menu.Item>
        <Menu.Item leftSection={<IconHelpCircle size={16} />} onClick={onOpenHelp}>
          {t('help.title')}
        </Menu.Item>
        <Menu.Item leftSection={prefersDarkMode ? <IconMoon size={16} /> : <IconSun size={16} />} onClick={onOpenThemeDialog}>
          {t('menu.theme')}
        </Menu.Item>
        <Menu.Item leftSection={<IconWaveSine size={16} />} onClick={onOpenSettings}>
          {t('menu.interface')}
        </Menu.Item>
        {isRecordingSupported && (
          <Menu.Item leftSection={<IconMicrophone size={16} />} onClick={onOpenAudioSettings}>
            {t('menu.audio')}
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconMapPinOff size={16} />} onClick={() => setDeleteMarkersOpen(true)} disabled={markerCount === 0}>
          {t('markers.deleteAll')}
        </Menu.Item>
        <Menu.Item leftSection={<IconTrashX size={16} />} onClick={onOpenDeleteAllDialog} disabled={tracksCount === 0}>
          {t('menu.deleteAllTracks')}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconRefresh size={16} />}
          onClick={async () => {
            // Unregister all service workers and hard reload
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((reg) => reg.unregister()));
            }
            // Hard reload bypassing all caches
            window.location.reload();
          }}
        >
          {t('menu.refresh')}
        </Menu.Item>

        <Menu.Label>{`${__APP_VERSION__} • ${new Date(__BUILD_DATE__).toLocaleString()}`}</Menu.Label>
      </Menu.Dropdown>
    </Menu>
  );

  return (
    <>
      <Group h="100%" px="md" gap={0} wrap="nowrap">
        <span style={{ marginRight: 16, display: 'flex', alignItems: 'center' }}>
          <StemuxIcon size={28} />
        </span>

        {/* Mobile: no title, pieces are managed from the menu */}
        {!isMobile && <Text>Stemux</Text>}

        {/* Desktop: Piece name with menu */}
        {!isMobile && currentPieceName && (
          <Menu position="bottom-start" shadow="md" onOpen={handleOpenPiecesMenu}>
            <Menu.Target>
              <Button variant="subtle" color="gray" c="var(--mantine-color-text)" ml="md" rightSection={<IconChevronDown size={18} />}>
                {currentPieceName}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconSettings size={16} />} onClick={onOpenPiecesManager}>
                {t('menu.pieces')}
              </Menu.Item>
              {recentPieces.length > 0 && <Menu.Label>{t('pieces.recentPieces')}</Menu.Label>}
              {recentPieces.map((piece) => (
                <Menu.Item key={piece.id} onClick={() => handleLoadPiece(piece.id)}>
                  {piece.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}

        <div style={{ flexGrow: 1 }} />

        {/* Mobile: tempo and edit mode are in the menu, to keep the bar light */}
        {!isMobile && <TempoPanel disabled={!hasLoadedTracks} compact={false} />}

        {/* Drag on the lanes: scroll (hand, default) or edit clips (move arrows) */}
        {!isMobile && (
          <Tooltip label={editMode ? t('timeline.editModeOn') : t('timeline.editModeOff')}>
            <span style={{ display: 'inline-flex', marginRight: 4 }}>
              <ActionIcon
                variant="subtle"
                color={editMode ? undefined : 'gray'}
                size="lg"
                onClick={() => setEditMode(!editMode)}
                disabled={!hasLoadedTracks}
                aria-label={t('timeline.editMode')}
                aria-pressed={editMode}
              >
                {editMode ? <IconArrowsMove size={20} /> : <IconHandStop size={20} />}
              </ActionIcon>
            </span>
          </Tooltip>
        )}

        {/* Magnetism for clip editing (Alt disables it during a drag) */}
        <Tooltip label={snapEnabled ? t('timeline.snapOn') : t('timeline.snapOff')}>
          <span style={{ display: 'inline-flex', marginRight: 8 }}>
            <ActionIcon
              variant="subtle"
              color={snapEnabled ? undefined : 'gray'}
              size="lg"
              onClick={() => setSnapEnabled(!snapEnabled)}
              disabled={!hasLoadedTracks}
              aria-label={t('timeline.snap')}
              aria-pressed={snapEnabled}
              style={{ opacity: snapEnabled ? 1 : 0.6 }}
            >
              <IconMagnet size={20} />
            </ActionIcon>
          </span>
        </Tooltip>

        {/* Zoom controls */}
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={onZoomOut} disabled={!hasLoadedTracks || zoomLevel <= 0} aria-label="Zoom out">
          <IconZoomOut size={22} />
        </ActionIcon>

        <Slider
          value={sliderValue}
          onChange={(value) => {
            onSliderDragStart(value);
            onZoomChange(value);
          }}
          onChangeEnd={onSliderDragEnd}
          min={0}
          max={100}
          disabled={!hasLoadedTracks}
          size="sm"
          label={null}
          w={120}
          mx="xs"
          thumbProps={{ 'aria-label': 'Zoom' }}
        />

        <ActionIcon variant="subtle" color="gray" size="lg" onClick={onZoomIn} disabled={!hasLoadedTracks || zoomLevel >= 500} aria-label="Zoom in" mr="xs">
          <IconZoomIn size={22} />
        </ActionIcon>

        {isMobile ? (
          <TempoPanel disabled={!hasLoadedTracks} compact opened={tempoOpen} onClose={() => setTempoOpen(false)}>
            {mainMenu}
          </TempoPanel>
        ) : (
          mainMenu
        )}
      </Group>

      <DeleteAllMarkersDialog open={deleteMarkersOpen} onClose={() => setDeleteMarkersOpen(false)} />

      {/* Progress bar, along the bottom border of the header */}
      <Progress
        value={progressPercent}
        size={3}
        radius={0}
        transitionDuration={0}
        color={isPlaying ? undefined : 'gray'}
        pos="absolute"
        bottom={0}
        left={0}
        right={0}
        bg="transparent"
      />
    </>
  );
};

export default TopBar;
