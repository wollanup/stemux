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
} from '@mui/material';
import { Loop, HelpOutline } from '@mui/icons-material';
import { useAudioStore, restoreTracks } from './hooks/useAudioStore';
import { useAudioEngine } from './hooks/useAudioEngine';
import FileUploader from './components/FileUploader';
import AudioTrack from './components/AudioTrack';
import BottomControlBar from './components/BottomControlBar';
import PhantomTimeline from './components/PhantomTimeline';
import LoopControls from './components/LoopControls';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { StemuxIcon } from './components/StemuxIcon';
import HelpModal from './components/HelpModal';
import { useTranslation } from 'react-i18next';

function App() {
  const { t } = useTranslation();
  const { tracks, initAudioContext, showLoopPanel, loopRegion, toggleLoopPanel } = useAudioStore();
  const [isLoadingStorage, setIsLoadingStorage] = useState(true);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  
  // Show phantom timeline if loop panel is open OR if a loop is active
  const hasActiveLoop = loopRegion.enabled && loopRegion.start < loopRegion.end && loopRegion.end > 0;
  const showPhantomTimeline = showLoopPanel || hasActiveLoop;
  const hasLoadedTracks = tracks.length > 0 && tracks.every((t) => t.buffer !== null);
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
  useAudioEngine();

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
            {/* Help button */}
            <IconButton
              color="inherit"
              onClick={() => setHelpModalOpen(true)}
              aria-label={t('help.title')}
            >
              <HelpOutline />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Help Modal */}
        <HelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />

        {/* Main content */}
        <Container maxWidth="lg" sx={{ pt: 10, pb: 10, flex: 1 }}>
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
