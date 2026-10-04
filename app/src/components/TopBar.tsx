import { useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  IconButton,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Divider,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Toolbar,
  Typography,
  Tooltip,
} from '@mui/material';
import {
  Album,
  DarkMode,
  DeleteSweep,
  WrongLocation,
  GraphicEq,
  HelpOutline,
  LightMode,
  MoreVert,
  Refresh,
  Settings,
  ZoomIn,
  ZoomOut,
  KeyboardArrowDown,
  Check,
  MusicNote,
  OpenWith,
  PanTool,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { StemuxIcon } from './StemuxIcon';
import MagnetIcon from './MagnetIcon';
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
  onOpenDeleteAllDialog,
  onOpenPiecesManager,
}: TopBarProps) => {
  const { t } = useTranslation();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [piecesMenuAnchorEl, setPiecesMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [recentPieces, setRecentPieces] = useState<PieceWithStats[]>([]);
  const [deleteMarkersOpen, setDeleteMarkersOpen] = useState(false);
  const [tempoAnchor, setTempoAnchor] = useState<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const tempo = useAudioStore((s) => s.tempo);
  const markerCount = useAudioStore((s) => s.loopState.markers.length);
  
  const { getRecentPieces, getCurrentPiece, loadPiece, currentPieceName, snapEnabled, setSnapEnabled, editMode, setEditMode } = useAudioStore();

  // Use live playback time hook (updates every 100ms)
  const currentTime = usePlaybackTime();
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Load pieces menu data when opening
  const handleOpenPiecesMenu = async (event: React.MouseEvent<HTMLElement>) => {
    setPiecesMenuAnchorEl(event.currentTarget);
    
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
    setPiecesMenuAnchorEl(null);
    try {
      await loadPiece(id);
    } catch (error) {
      console.error('Failed to load piece:', error);
    }
  };

  return (
    <AppBar position="fixed" elevation={2} color="default" sx={{ bgcolor: 'background.paper' }}>
      <Toolbar>
        <Box sx={{ mr: 2, display: 'flex', alignItems: 'center' }}>
          <StemuxIcon size={28} />
        </Box>
        
        {/* Mobile: no title, pieces are managed from the menu */}
        {!isMobile && (
          <Typography variant="body1" component="div">
            Stemux
          </Typography>
        )}

        {/* Desktop: Piece name with menu */}
        {!isMobile && currentPieceName && (
          <>
            <Button
              color="inherit"
              onClick={handleOpenPiecesMenu}
              endIcon={<KeyboardArrowDown />}
              sx={{ ml: 2, textTransform: 'none' }}
            >
              {currentPieceName}
            </Button>
            <Menu
              anchorEl={piecesMenuAnchorEl}
              open={Boolean(piecesMenuAnchorEl)}
              onClose={() => setPiecesMenuAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              <MenuItem
                onClick={() => {
                  setPiecesMenuAnchorEl(null);
                  onOpenPiecesManager();
                }}
              >
                <ListItemIcon>
                  <Settings fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('menu.pieces')}</ListItemText>
              </MenuItem>
              
              {recentPieces.length > 0 && <MenuItem disabled sx={{ opacity: 0.6 }}>
                <ListItemText
                  primary={t('pieces.recentPieces')}
                  slotProps={{ primary: { variant: 'caption', color: 'text.secondary' } }}
                />
              </MenuItem>}
              
              {recentPieces.map((piece) => (
                <MenuItem key={piece.id} onClick={() => handleLoadPiece(piece.id)}>
                  <ListItemText primary={piece.name} />
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Mobile: tempo and edit mode are in the menu, to keep the bar light */}
        <TempoPanel
          disabled={!hasLoadedTracks}
          compact={isMobile}
          {...(isMobile ? { anchorEl: tempoAnchor, onClose: () => setTempoAnchor(null) } : {})}
        />

        {/* Drag on the lanes: scroll (hand, default) or edit clips (move arrows) */}
        {!isMobile && (
          <Tooltip title={editMode ? t('timeline.editModeOn') : t('timeline.editModeOff')}>
            <span>
              <IconButton
                color={editMode ? 'primary' : 'inherit'}
                onClick={() => setEditMode(!editMode)}
                disabled={!hasLoadedTracks}
                aria-label={t('timeline.editMode')}
                aria-pressed={editMode}
                sx={{ mr: 0.5 }}
              >
                {editMode ? <OpenWith fontSize="small" /> : <PanTool fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Magnetism for clip editing (Alt disables it during a drag) */}
        <Tooltip title={snapEnabled ? t('timeline.snapOn') : t('timeline.snapOff')}>
          <span>
            <IconButton
              color={snapEnabled ? 'primary' : 'inherit'}
              onClick={() => setSnapEnabled(!snapEnabled)}
              disabled={!hasLoadedTracks}
              aria-label={t('timeline.snap')}
              aria-pressed={snapEnabled}
              sx={{ mr: 1, opacity: snapEnabled ? 1 : 0.6 }}
            >
              <MagnetIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Zoom controls */}
        <IconButton
          color="inherit"
          onClick={onZoomOut}
          disabled={!hasLoadedTracks || zoomLevel <= 0}
          aria-label="Zoom out"
        >
          <ZoomOut />
        </IconButton>

        <Slider
          value={sliderValue}
          onChange={(_, value) => {
            const newValue = value as number;
            onSliderDragStart(newValue);
            onZoomChange(newValue);
          }}
          onChangeCommitted={onSliderDragEnd}
          min={0}
          max={100}
          disabled={!hasLoadedTracks}
          size="small"
          color="secondary"
          sx={{ width: 120, mx: 1 }}
          aria-label="Zoom"
        />

        <IconButton
          color="inherit"
          onClick={onZoomIn}
          disabled={!hasLoadedTracks || zoomLevel >= 500}
          aria-label="Zoom in"
          sx={{ mr: 1 }}
        >
          <ZoomIn />
        </IconButton>

        <Stack gap={2} direction="row" alignItems="center">
          {/* Menu button */}
          <IconButton
            ref={menuButtonRef}
            color="inherit"
            onClick={(e) => setMenuAnchorEl(e.currentTarget)}
            aria-label={t('menu.title')}
          >
            <MoreVert />
          </IconButton>
        </Stack>

        {/* Menu */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={() => setMenuAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {isMobile && [
            <MenuItem
              key="tempo"
              disabled={!hasLoadedTracks}
              onClick={() => {
                setMenuAnchorEl(null);
                setTempoAnchor(menuButtonRef.current);
              }}
            >
              <ListItemIcon>
                <MusicNote fontSize="small" />
              </ListItemIcon>
              <ListItemText>{tempo ? `${t('tempo.title')} · ${Math.round(tempo.bpm * 10) / 10} BPM` : t('tempo.title')}</ListItemText>
            </MenuItem>,
            <MenuItem
              key="edit-mode"
              role="menuitemcheckbox"
              aria-checked={editMode}
              disabled={!hasLoadedTracks}
              onClick={() => {
                setMenuAnchorEl(null);
                setEditMode(!editMode);
              }}
            >
              <ListItemIcon>{editMode ? <OpenWith fontSize="small" /> : <PanTool fontSize="small" />}</ListItemIcon>
              <ListItemText>{t('timeline.editMode')}</ListItemText>
              {editMode && <Check fontSize="small" sx={{ ml: 2 }} />}
            </MenuItem>,
            <Divider key="divider" />,
          ]}

          <MenuItem
            onClick={() => {
              setMenuAnchorEl(null);
              onOpenPiecesManager();
            }}
          >
            <ListItemIcon>
              <Album fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('menu.pieces')}</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={() => {
              setMenuAnchorEl(null);
              onOpenHelp();
            }}
          >
            <ListItemIcon>
              <HelpOutline fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('help.title')}</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={() => {
              setMenuAnchorEl(null);
              onOpenThemeDialog();
            }}
          >
            <ListItemIcon>
              {prefersDarkMode ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{t('menu.theme')}</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={(e) => {
              setMenuAnchorEl(null);
              // Blur the button to avoid aria-hidden focus conflict
              if (e.currentTarget) {
                (e.currentTarget as HTMLElement).blur();
              }
              setTimeout(() => onOpenSettings(), 50);
            }}
          >
            <ListItemIcon>
              <GraphicEq fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('menu.interface')}</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={() => {
              setMenuAnchorEl(null);
              setDeleteMarkersOpen(true);
            }}
            disabled={markerCount === 0}
          >
            <ListItemIcon>
              <WrongLocation fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('markers.deleteAll')}</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={() => {
              setMenuAnchorEl(null);
              onOpenDeleteAllDialog();
            }}
            disabled={tracksCount === 0}
          >
            <ListItemIcon>
              <DeleteSweep fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('menu.deleteAllTracks')}</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={async () => {
              setMenuAnchorEl(null);
              // Unregister all service workers and hard reload
              if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((reg) => reg.unregister()));
              }
              // Hard reload bypassing all caches
              window.location.reload();
            }}
          >
            <ListItemIcon>
              <Refresh fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('menu.refresh')}</ListItemText>
          </MenuItem>

          <MenuItem disabled sx={{ opacity: '0.6 !important' }}>
            <ListItemText
              primary={`${__APP_VERSION__} • ${new Date(__BUILD_DATE__).toLocaleString()}`}
              slotProps={{
                primary: {
                  variant: 'caption',
                  color: 'text.secondary',
                },
              }}
            />
          </MenuItem>
        </Menu>
      </Toolbar>

      <DeleteAllMarkersDialog open={deleteMarkersOpen} onClose={() => setDeleteMarkersOpen(false)} />

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progressPercent}
        sx={{
          height: 3,
          backgroundColor: 'transparent',
          '& .MuiLinearProgress-bar': {
            backgroundColor: isPlaying ? 'primary.light' : 'action.disabled',
            transition: 'none', // Remove animation for instant updates
          },
        }}
      />
    </AppBar>
  );
};

export default TopBar;
