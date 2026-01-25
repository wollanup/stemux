import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  AlertTitle,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Container,
  createTheme,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
  useMediaQuery
} from '@mui/material';
import {
  DarkMode,
  DeleteSweep,
  Edit,
  GraphicEq,
  HelpOutline,
  LightMode,
  MoreVert,
  Refresh,
  ZoomIn,
  ZoomOut
} from '@mui/icons-material';
import {restoreTracks, useAudioStore} from './hooks/useAudioStore';
import {useSyncWaveformScroll} from './hooks/useSyncWaveformScroll';
import FileUploader from './components/FileUploader';
import AudioTrack from './components/AudioTrack';
import BottomControlBar from './components/BottomControlBar';
import MarkersPanel from './components/MarkersPanel';
import {PWAUpdatePrompt} from './components/PWAUpdatePrompt';
import {StemuxIcon} from './components/StemuxIcon';
import HelpModal from './components/HelpModal';
import {useTranslation} from 'react-i18next';
import {logger} from './utils/logger';

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

// Zoom presets with logarithmic slider positions
const ZOOM_PRESETS = [
  { zoom: 0, slider: 0 },
  { zoom: 1, slider: 5 },
  { zoom: 5, slider: 20 },
  { zoom: 10, slider: 40 },
  { zoom: 50, slider: 60 },
  { zoom: 250, slider: 80 },
  { zoom: 500, slider: 100 },
];

function App() {
  const { t } = useTranslation();
  const { tracks, initAudioContext, loopState, toggleLoopEditMode, zoomLevel, waveformStyle, setWaveformStyle, waveformNormalize, setWaveformNormalize, removeAllTracks } = useAudioStore();
  const waveformTimeline = useAudioStore(state => state.waveformTimeline);
  const setWaveformTimeline = useAudioStore(state => state.setWaveformTimeline);
  const waveformMinimap = useAudioStore(state => state.waveformMinimap);
  const setWaveformMinimap = useAudioStore(state => state.setWaveformMinimap);

  // Sync waveform scroll across all tracks (for touch gestures)
  useSyncWaveformScroll(zoomLevel > 0);

  // Slider value derivation: derive from zoomLevel UNLESS user is actively dragging
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [dragSliderValue, setDragSliderValue] = useState(0);

  // Helper to calculate slider position from zoom level
  const calculateSliderFromZoom = useCallback((zoom: number) => {
    const preset = ZOOM_PRESETS.find(p => p.zoom === zoom);
    if (preset) return preset.slider;
    if (zoom === 0) return 0;
    const sliderPos = Math.round(Math.log(zoom) / Math.log(2.74) * 20);
    return Math.min(Math.max(sliderPos, 0), 100);
  }, []);

  // Derive slider value: use drag value when dragging, otherwise sync with zoomLevel
  const sliderValue = isDraggingSlider ? dragSliderValue : calculateSliderFromZoom(zoomLevel);

  // Zoom change handler - logarithmic scale
  const handleZoomChange = (newSliderValue: number) => {
    // Find the closest preset for this slider value
    const preset = ZOOM_PRESETS.find(p => p.slider === newSliderValue);
    if (preset) {
      useAudioStore.setState({ zoomLevel: preset.zoom });
    } else {
      // Fallback for manual slider adjustments between presets
      if (newSliderValue === 0) {
        useAudioStore.setState({ zoomLevel: 0 });
      } else {
        const zoom = Math.round(Math.pow(2.74, newSliderValue / 20));
        useAudioStore.setState({ zoomLevel: Math.min(zoom, 500) });
      }
    }
  };

  const zoomIn = useCallback(() => {
    const currentIndex = ZOOM_PRESETS.findIndex(preset => preset.zoom > zoomLevel);
    if (currentIndex !== -1 && currentIndex < ZOOM_PRESETS.length) {
      const nextSlider = ZOOM_PRESETS[currentIndex].slider;
      handleZoomChange(nextSlider);
    } else if (zoomLevel < 500) {
      // Si on est entre deux presets ou au-delà du dernier, aller au max
      handleZoomChange(100);
    }
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    // Find current or next higher preset
    let currentIndex = ZOOM_PRESETS.findIndex(preset => preset.zoom >= zoomLevel);
    if (currentIndex === -1) currentIndex = ZOOM_PRESETS.length - 1;
    if (currentIndex > 0) {
      const prevSlider = ZOOM_PRESETS[currentIndex - 1].slider;
      handleZoomChange(prevSlider);
    }
  }, [zoomLevel]);

  const [isLoadingStorage, setIsLoadingStorage] = useState(true);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [showEditModeAlert, setShowEditModeAlert] = useState(() => {
    return localStorage.getItem('hideEditModeAlert') !== 'true';
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const hasLoadedTracks = tracks.length > 0;

  // Detect system theme preference
  const systemPrefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkModeOverride, setDarkModeOverride] = useState<boolean | null>(null);
  const prefersDarkMode = darkModeOverride !== null ? darkModeOverride : systemPrefersDarkMode;

  // Detect screen size for responsive scaling
  const isLargeScreen = useMediaQuery('(min-width:1920px)'); // 4K, 1440p+
  const isMediumScreen = useMediaQuery('(min-width:1280px) and (max-width:1919px)'); // 1080p-1440p

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? 'dark' : 'light',
          primary: {
            main: '#1976d2',
          },
          ...(prefersDarkMode
            ? {
                background: {
                  default: '#121212',
                  paper: '#1e1e1e',
                },
              }
            : {
                background: {
                  default: '#f5f5f5',
                },
              }),
        },
        typography: {
          fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
          // Scale everything based on screen size
          fontSize: isLargeScreen ? 16 : isMediumScreen ? 14 : 14,
          h6: {
            fontSize: isLargeScreen ? '1.5rem' : '1.25rem',
          },
          body1: {
            fontSize: isLargeScreen ? '1.1rem' : '1rem',
          },
          body2: {
            fontSize: isLargeScreen ? '1rem' : '0.875rem',
          },
          button: {
            fontSize: isLargeScreen ? '1rem' : '0.875rem',
          },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                minHeight: isLargeScreen ? 48 : 40,
                fontSize: isLargeScreen ? '1rem' : '0.875rem',
              },
              sizeSmall: {
                minHeight: isLargeScreen ? 40 : 32,
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                padding: isLargeScreen ? 12 : 8,
              },
              sizeSmall: {
                padding: isLargeScreen ? 8 : 4,
              },
            },
          },
          MuiFab: {
            styleOverrides: {
              root: {
                width: isLargeScreen ? 72 : 56,
                height: isLargeScreen ? 72 : 56,
              },
            },
          },
          MuiSlider: {
            styleOverrides: {
              thumb: {
                width: isLargeScreen ? 24 : 20,
                height: isLargeScreen ? 24 : 20,
              },
            },
          },
        },
      }),
    [prefersDarkMode, isLargeScreen, isMediumScreen]
  );

  useEffect(() => {
    const loadApp = async () => {
      initAudioContext();

      // Restore tracks (creates them with buffer: null first)
      await restoreTracks();

      // Now tracks are in the store (with skeletons), hide loader
      setIsLoadingStorage(false);
    };
    loadApp();
  }, [initAudioContext]);

  // Handle Ctrl+Wheel for zooming and Alt+Wheel for horizontal scroll
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Only handle if there are tracks loaded
      if (tracks.length === 0) {
        return;
      }

      // Ctrl+Wheel = Zoom
      if (e.ctrlKey) {
        e.preventDefault();
        
        // deltaY < 0 = scroll up = zoom in
        // deltaY > 0 = scroll down = zoom out
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      } 
      // Alt+Wheel = Horizontal scroll when zoomed
      else if (e.altKey && zoomLevel > 0) {
        e.preventDefault();
        
        // Get all waveform containers and scroll them
        const waveformWrappers = document.querySelectorAll('[data-wavesurfer]');
        
        waveformWrappers.forEach((wrapper) => {
          // WaveSurfer uses Shadow DOM - find the first child with shadowRoot
          const firstChild = wrapper.firstElementChild;
          
          if (firstChild && firstChild.shadowRoot) {
            // Find the .scroll element inside Shadow DOM
            const scrollElement = firstChild.shadowRoot.querySelector('.scroll') as HTMLElement;
            
            if (scrollElement) {
              const currentScroll = scrollElement.scrollLeft;
              scrollElement.scrollLeft = currentScroll + e.deltaY;
            } else {
              logger.debug('❌ No .scroll element found in Shadow DOM');
            }
          } else {
            logger.debug('⚠️ No Shadow DOM found on first child');
          }
        });
      } else {
        logger.debug('⚠️ Conditions not met for scroll - zoomLevel:', zoomLevel);
      }
    };

    // Add listener with passive: false to allow preventDefault
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [tracks.length, zoomLevel, zoomIn, zoomOut]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PWAUpdatePrompt />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Top App Bar */}
        <AppBar position="fixed" elevation={2}>
          <Toolbar>
            <Box sx={{ mr: 2, display: 'flex', alignItems: 'center' }}>
              <StemuxIcon size={28} />
            </Box>
            <Typography variant="h6" component="div">
              Stemux
            </Typography>
            <Box sx={{ flexGrow: 1 }} />

            {/* Zoom controls */}
            <IconButton
              color="inherit"
              onClick={zoomOut}
              disabled={!hasLoadedTracks || zoomLevel <= 0}
              aria-label="Zoom out"
            >
              <ZoomOut />
            </IconButton>

            <Slider
              value={sliderValue}
              onChange={(_, value) => {
                const newValue = value as number;
                setIsDraggingSlider(true);
                setDragSliderValue(newValue);
                handleZoomChange(newValue);
              }}
              onChangeCommitted={() => {
                setIsDraggingSlider(false);
              }}
              min={0}
              max={100}
              disabled={!hasLoadedTracks}
              size="small"
              color="secondary"
              sx={{
                width: 120,
                mx: 1,
              }}
              aria-label="Zoom"
            />

            <IconButton
              color="inherit"
              onClick={zoomIn}
              disabled={!hasLoadedTracks || zoomLevel >= 500}
              aria-label="Zoom in"
              sx={{ mr: 1 }}
            >
              <ZoomIn />
            </IconButton>
            <Stack gap={2} direction="row" alignItems="center">

            {/* Loop v2 Edit Mode button */}
            <IconButton
              color="inherit"
              onClick={toggleLoopEditMode}
              disabled={!hasLoadedTracks}
              aria-label="Loop Edit Mode"
              sx={{
                bgcolor: loopState.editMode ? 'warning.main' : 'transparent',
                color: loopState.editMode ? 'warning.contrastText' : 'inherit',
                '&:hover': {
                  bgcolor: loopState.editMode ? 'warning.dark' : 'action.hover',
                },
              }}
            >
              <Edit />
            </IconButton>
            
            {/* Menu button */}
            <IconButton
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
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem onClick={() => {
                setMenuAnchorEl(null);
                setHelpModalOpen(true);
              }}>
                <ListItemIcon>
                  <HelpOutline fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('help.title')}</ListItemText>
              </MenuItem>


              <MenuItem onClick={() => {
                setDarkModeOverride(prev => prev === null ? !systemPrefersDarkMode : !prev);
              }}>
                <ListItemIcon>
                  {prefersDarkMode ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
                </ListItemIcon>
                <ListItemText>
                  {prefersDarkMode ? 'Light Mode' : 'Dark Mode'}
                </ListItemText>
              </MenuItem>

              {/* waveform*/}
              <MenuItem onClick={() => {
                setWaveformStyle(waveformStyle === 'modern' ? 'classic' : 'modern');
              }}>
                <ListItemIcon>
                  <GraphicEq fontSize="small" />
                </ListItemIcon>
                <ListItemText>
                  {waveformStyle === 'modern' ? t('menu.waveformClassic') : t('menu.waveformModern')}
                </ListItemText>
              </MenuItem>

              <MenuItem onClick={() => {
                setWaveformNormalize(!waveformNormalize);
              }}>
                <ListItemIcon>
                  <GraphicEq fontSize="small" />
                </ListItemIcon>
                <ListItemText>
                  {waveformNormalize ? t('menu.normalizeOff') : t('menu.normalizeOn')}
                </ListItemText>
              </MenuItem>
              <MenuItem onClick={() => {
                setWaveformTimeline(!waveformTimeline);
              }}>
                <ListItemIcon>
                  <GraphicEq fontSize="small" />
                </ListItemIcon>
                <ListItemText>
                  Timeline {waveformTimeline ? 'Off' : 'On'}
                </ListItemText>
              </MenuItem>
              <MenuItem onClick={() => {
                setWaveformMinimap(!waveformMinimap);
              }}>
                <ListItemIcon>
                  <GraphicEq fontSize="small" />
                </ListItemIcon>
                <ListItemText>
                  Minimap {waveformMinimap ? 'Off' : 'On'}
                </ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchorEl(null);
                  setDeleteAllDialogOpen(true);
                }} 
                disabled={tracks.length === 0}
              >
                <ListItemIcon>
                  <DeleteSweep fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('menu.deleteAllTracks')}</ListItemText>
              </MenuItem>
              <MenuItem onClick={async () => {
                setMenuAnchorEl(null);
                // Unregister all service workers and hard reload
                if ('serviceWorker' in navigator) {
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(registrations.map(reg => reg.unregister()));
                }
                // Hard reload bypassing all caches
                window.location.reload();
              }}>
                <ListItemIcon>
                  <Refresh fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('menu.refresh')}</ListItemText>
              </MenuItem>
              <MenuItem disabled sx={{ opacity: '0.6 !important' }}>
                <ListItemText
                  primary={`${__APP_VERSION__} ${new Date(__BUILD_DATE__).toLocaleString()}`}
                  slotProps={{
                    primary: {
                      variant: 'caption',
                      color: 'text.secondary'
                    }
                  }}
                />
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        {/* Help Modal */}
        <HelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />

        {/* Delete All Tracks Confirmation Dialog */}
        <Dialog
          open={deleteAllDialogOpen}
          onClose={() => setDeleteAllDialogOpen(false)}
        >
          <DialogTitle>{t('menu.deleteAllConfirmTitle')}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {t('menu.deleteAllConfirmMessage')}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteAllDialogOpen(false)}>
              {t('track.cancelButton')}
            </Button>
            <Button 
              onClick={async () => {
                await removeAllTracks();
                setDeleteAllDialogOpen(false);
              }} 
              color="error"
              variant="contained"
            >
              {t('menu.deleteAllConfirmButton')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Main content */}
        <Container 
          ref={containerRef}
          maxWidth="xl" 
          sx={{ 
            pt: 10, 
            pb: 10, 
            flex: 1,
            overflowX: zoomLevel > 0 ? 'auto' : 'visible',
            overflowY: 'visible',
          }}
        >
          {/* Track list or empty state */}
          {isLoadingStorage ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '50vh',
                gap: 2,
              }}
            >
              <CircularProgress size={48} />
              <Typography variant="body2" color="text.secondary">
                {t('loading.tracks')}
              </Typography>
            </Box>
          ) : tracks.length === 0 ? (
            <Box>
              <FileUploader />
              <Box
                sx={{
                  textAlign: 'center',
                  py: 4,
                }}
              >
                <Typography variant="h5" color="text.secondary" gutterBottom>
                  {t('app.noTracksTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('app.noTracksMessage')}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box>
              {/* Markers Panel - shown when markers exist */}
              <MarkersPanel />

              {/* Edit Mode Alert */}
              <Collapse in={loopState.editMode && showEditModeAlert}>
                <Alert 
                  severity="warning" 
                  onClose={() => {
                    setShowEditModeAlert(false);
                    localStorage.setItem('hideEditModeAlert', 'true');
                  }}
                  sx={{ mx: 2, mt: 2 }}
                >
                  <AlertTitle>Mode Édition</AlertTitle>
                  Cliquez sur la forme d'onde pour créer des repères et boucles. <a href="#" onClick={(e) => { e.preventDefault(); setHelpModalOpen(true); }} style={{ color: 'inherit' }}>Plus d'infos</a>
                </Alert>
              </Collapse>

              {tracks.map((track) => (
                <AudioTrack key={track.id} track={track} />
              ))}
              {/* File uploader at bottom when tracks exist */}
              <FileUploader />
            </Box>
          )}
        </Container>

        {/* Bottom control bar */}
        <BottomControlBar />
      </Box>
    </ThemeProvider>
  );
}

export default App;
