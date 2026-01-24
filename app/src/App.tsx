import { useEffect, useMemo, useState } from 'react';
import {
  Container,
  Box,
  Typography,
  AppBar,
  Toolbar,
  CssBaseline,
  ThemeProvider,
  createTheme,
  useMediaQuery,
  CircularProgress,
  Collapse,
  Paper,
  IconButton,
  Slide,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Slider, Stack
} from '@mui/material';
import { Loop, HelpOutline, ZoomIn, ZoomOut, MoreVert, Refresh } from '@mui/icons-material';
import { useAudioStore, restoreTracks } from './hooks/useAudioStore';
import FileUploader from './components/FileUploader';
import AudioTrack from './components/AudioTrack';
import BottomControlBar from './components/BottomControlBar';
import PhantomTimeline from './components/PhantomTimeline';
import LoopControls from './components/LoopControls';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { StemuxIcon } from './components/StemuxIcon';
import HelpModal from './components/HelpModal';
import { useTranslation } from 'react-i18next';

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

function App() {
  const { t } = useTranslation();
  const { tracks, initAudioContext, showLoopPanel, loopRegion, toggleLoopPanel, zoomLevel } = useAudioStore();

  // Local slider state (controlled)
  const [sliderValue, setSliderValue] = useState(0);

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

  const zoomIn = () => {
    const currentIndex = ZOOM_PRESETS.findIndex(preset => preset.zoom > zoomLevel);
    if (currentIndex !== -1 && currentIndex < ZOOM_PRESETS.length) {
      const nextSlider = ZOOM_PRESETS[currentIndex].slider;
      setSliderValue(nextSlider);
      handleZoomChange(nextSlider);
    } else if (zoomLevel < 500) {
      // Si on est entre deux presets ou au-delà du dernier, aller au max
      setSliderValue(100);
      handleZoomChange(100);
    }
  };

  const zoomOut = () => {
    // Find current or next higher preset
    let currentIndex = ZOOM_PRESETS.findIndex(preset => preset.zoom >= zoomLevel);
    if (currentIndex === -1) currentIndex = ZOOM_PRESETS.length - 1;
    if (currentIndex > 0) {
      const prevSlider = ZOOM_PRESETS[currentIndex - 1].slider;
      setSliderValue(prevSlider);
      handleZoomChange(prevSlider);
    }
  };
  const [isLoadingStorage, setIsLoadingStorage] = useState(true);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);

  // Show phantom timeline if loop panel is open OR if a loop is active
  const hasActiveLoop = loopRegion.enabled && loopRegion.start < loopRegion.end && loopRegion.end > 0;
  const showPhantomTimeline = showLoopPanel || hasActiveLoop;
  const hasLoadedTracks = tracks.length > 0;
  const hasLoopDefined = loopRegion.start < loopRegion.end && loopRegion.end > 0;

  // Detect system theme preference
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

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
  }, []);

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
                setSliderValue(newValue);
                handleZoomChange(newValue);
              }}
              min={0}
              max={100}
              disabled={!hasLoadedTracks}
              size="small"
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
            {/* Loop button on the right */}
            <IconButton
              color="inherit"
              onClick={toggleLoopPanel}
              disabled={!hasLoadedTracks}
              aria-label={t('controls.loop')}
              sx={{
                bgcolor: hasLoopDefined
                  ? (loopRegion.enabled ? 'success.main' : 'warning.main')
                  : 'transparent',
                '&:hover': {
                  bgcolor: hasLoopDefined
                    ? (loopRegion.enabled ? 'success.dark' : 'warning.dark')
                    : 'action.hover',
                },
              }}
            >

              <Loop />
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

        {/* Main content */}
        <Container maxWidth="xl" sx={{ pt: 10, pb: 10, flex: 1 }}>
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
                  No tracks loaded
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Drop your audio files above to get started
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box>
              {/* Loop Panel - shown above tracks when active */}
              <Slide direction="down" in={showPhantomTimeline} mountOnEnter unmountOnExit>
                <Paper
                  elevation={2}
                  sx={{
                    p: 2,
                    mb: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                  }}
                >
                  <PhantomTimeline />
                  <Collapse in={showLoopPanel}>
                    <Box>
                      <Typography variant="caption" fontWeight={600} color="text.secondary" mt={2} mb={1.5} display="block">
                        {t('loop.title')}
                      </Typography>
                      <LoopControls />
                    </Box>
                  </Collapse>
                </Paper>
              </Slide>

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
