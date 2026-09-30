import {useEffect, useMemo, useState} from 'react';
import {
    Box,
    Button,
    CircularProgress,
    createTheme,
    CssBaseline,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    ThemeProvider,
    Toolbar,
    Typography,
    useMediaQuery,
    Radio,
    RadioGroup,
    FormControlLabel,
    FormControl,
} from '@mui/material';
import {restoreTracks, useAudioStore} from './hooks/useAudioStore';
import TrackAdder from './components/TrackAdder';
import FullScreenDropZone from './components/FullScreenDropZone';
import Timeline from './timeline/Timeline';
import {zoomBy} from './timeline/zoomActions';
import {sliderFromZoom, zoomFromSlider} from './timeline/zoom';
import BottomControlBar from './components/BottomControlBar';
import MarkersPanel from './components/MarkersPanel';
import {PWAUpdatePrompt} from './components/PWAUpdatePrompt';
import HelpModal from './components/HelpModal';
import SettingsUI from './components/SettingsUI';
import PiecesManager from './components/PiecesManager';
import RecordingPermissionGuide from './components/RecordingPermissionGuide';
import {useTranslation} from 'react-i18next';
import {logger} from './utils/logger';
import TopBar from "./components/TopBar.tsx";

// Declarations for version info (defined by Vite, may be used later)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __APP_VERSION__: string;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __BUILD_DATE__: string;

function App() {
    const {t} = useTranslation();
    const {
        tracks,
        initAudioContext,
        zoomLevel,
        removeAllTracks,
        playbackState,
    } = useAudioStore();

    // Slider value: follows zoomLevel unless the user is dragging it
    const [dragSliderValue, setDragSliderValue] = useState<number | null>(null);
    const sliderValue = dragSliderValue ?? sliderFromZoom(zoomLevel);
    const handleZoomChange = (value: number) => useAudioStore.setState({zoomLevel: zoomFromSlider(value)});

    const [isLoadingStorage, setIsLoadingStorage] = useState(true);
    const [helpModalOpen, setHelpModalOpen] = useState(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [themeDialogOpen, setThemeDialogOpen] = useState(false);
    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [piecesManagerOpen, setPiecesManagerOpen] = useState(false);
    const [recordingGuideOpen, setRecordingGuideOpen] = useState(false);

    const hasLoadedTracks = tracks.length > 0;

    // Show recording guide on first arm
    useEffect(() => useAudioStore.subscribe((state) => {
        const hasSeenGuide = localStorage.getItem('hasSeenRecordingGuide') === 'true';
        const hasArmedTrack = state.tracks.some(t => t.isArmed);

        if (!hasSeenGuide && hasArmedTrack) {
            setRecordingGuideOpen(true);
            localStorage.setItem('hasSeenRecordingGuide', 'true');
        }
    }), []);

    // Detect system theme preference
    const systemPrefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
        const saved = localStorage.getItem('themeMode');
        return (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'system';
    });
    const prefersDarkMode = themeMode === 'system' ? systemPrefersDarkMode : themeMode === 'dark';

    // Detect screen size for responsive scaling
    const isLargeScreen = useMediaQuery('(min-width:1920px)'); // 4K, 1440p+
    const isMediumScreen = useMediaQuery('(min-width:1280px) and (max-width:1919px)'); // 1080p-1440p
    const isMobile = useMediaQuery('(max-width:899px)'); // Mobile/tablet breakpoint

    const theme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode: prefersDarkMode ? 'dark' : 'light',
                    primary: {
                        main: '#1976d2'
                    },
                    ...(prefersDarkMode
                        ? {
                            background: {
                                default: '#121212',
                                paper: '#1e1e1e'
                            }
                        }
                        : {
                            background: {
                                default: '#f5f5f5'
                            }
                        })
                },
                typography: {
                    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
                    // Scale everything based on screen size
                    fontSize: isLargeScreen ? 16 : isMediumScreen ? 14 : 14,
                    h6: {
                        fontSize: isLargeScreen ? '1.5rem' : '1.25rem'
                    },
                    body1: {
                        fontSize: isLargeScreen ? '1.1rem' : '1rem'
                    },
                    body2: {
                        fontSize: isLargeScreen ? '1rem' : '0.875rem'
                    },
                    button: {
                        fontSize: isLargeScreen ? '1rem' : '0.875rem'
                    }
                },
                components: {
                    MuiButton: {
                        styleOverrides: {
                            root: {
                                minHeight: isLargeScreen ? 48 : 40,
                                fontSize: isLargeScreen ? '1rem' : '0.875rem'
                            },
                            sizeSmall: {
                                minHeight: isLargeScreen ? 40 : 32
                            }
                        }
                    },
                    MuiIconButton: {
                        styleOverrides: {
                            root: {
                                padding: isLargeScreen ? 12 : 8
                            },
                            sizeSmall: {
                                padding: isLargeScreen ? 8 : 4
                            }
                        }
                    },
                    MuiFab: {
                        styleOverrides: {
                            root: {
                                width: isLargeScreen ? 72 : 56,
                                height: isLargeScreen ? 72 : 56
                            }
                        }
                    },
                    MuiSlider: {
                        styleOverrides: {
                            thumb: {
                                width: isLargeScreen ? 24 : 20,
                                height: isLargeScreen ? 24 : 20
                            }
                        }
                    }
                }
            }),
        [prefersDarkMode, isLargeScreen, isMediumScreen]
    );

    useEffect(() => {
        const loadApp = async () => {
            initAudioContext();

            // Clean orphaned data silently in background
            try {
                const { cleanOrphanedData } = useAudioStore.getState();
                const result = await cleanOrphanedData();
                if (result.filesDeleted > 0 || result.referencesRemoved > 0) {
                    logger.log(`🧹 Auto-cleanup: ${result.filesDeleted} orphaned files deleted, ${result.referencesRemoved} invalid references removed`);
                }
            } catch (error) {
                console.warn('Failed to clean orphaned data on startup:', error);
            }

            // Restore tracks (creates them with buffer: null first)
            await restoreTracks();

            // Now tracks are in the store (with skeletons), hide loader
            setIsLoadingStorage(false);
        };
        loadApp();
    }, [initAudioContext]);

    // Handle window-wide drag and drop for audio files
    const [isDraggingFile, setIsDraggingFile] = useState(false);

    useEffect(() => {
        let dragCounter = 0; // Track enter/leave events to avoid flickering

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            dragCounter++;
            
            // Only show drop zone if dragging files
            if (e.dataTransfer?.types.includes('Files')) {
                setIsDraggingFile(true);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            dragCounter--;
            
            if (dragCounter === 0) {
                setIsDraggingFile(false);
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            // Set dropEffect to indicate we accept files
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            dragCounter = 0;
            setIsDraggingFile(false);

            const files = Array.from(e.dataTransfer?.files || []);
            files.forEach((file) => {
                if (file.type.includes('audio') && tracks.length < 8) {
                    useAudioStore.getState().addTrack(file);
                }
            });
        };

        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);

        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, [tracks.length]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            <PWAUpdatePrompt/>
            <Box sx={{display: 'flex', flexDirection: 'column', height: '100dvh'}}>
                {/* Top App Bar */}
                <TopBar
                    hasLoadedTracks={hasLoadedTracks}
                    zoomLevel={zoomLevel}
                    sliderValue={sliderValue}
                    prefersDarkMode={prefersDarkMode}
                    isMobile={isMobile}
                    tracksCount={tracks.length}
                    isPlaying={playbackState.isPlaying}
                    duration={playbackState.duration}
                    onZoomOut={() => zoomBy(-1)}
                    onZoomIn={() => zoomBy(1)}
                    onZoomChange={handleZoomChange}
                    onSliderDragStart={(value: number) => setDragSliderValue(value)}
                    onSliderDragEnd={() => setDragSliderValue(null)}
                    onOpenHelp={() => setHelpModalOpen(true)}
                    onOpenThemeDialog={() => setThemeDialogOpen(true)}
                    onOpenSettings={() => setSettingsModalOpen(true)}
                    onOpenDeleteAllDialog={() => setDeleteAllDialogOpen(true)}
                    onOpenPiecesManager={() => setPiecesManagerOpen(true)}
                />


                {/* Help Modal */}
                <HelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)}/>
                <SettingsUI open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)}/>
                <PiecesManager open={piecesManagerOpen} onClose={() => setPiecesManagerOpen(false)} />
                <RecordingPermissionGuide 
                    open={recordingGuideOpen} 
                    onClose={() => setRecordingGuideOpen(false)} 
                />

                {/* Interface Settings Modal */}
                <SettingsUI open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)}/>

                {/* Theme Selection Dialog */}
                <Dialog
                    open={themeDialogOpen}
                    onClose={() => setThemeDialogOpen(false)}
                    maxWidth="xs"
                    fullWidth
                >
                    <DialogTitle>{t('menu.themeDialog.title')}</DialogTitle>
                    <DialogContent>
                        <FormControl component="fieldset" fullWidth sx={{mt: 1}}>
                            <RadioGroup
                                value={themeMode}
                                onChange={(e) => {
                                    const newMode = e.target.value as 'light' | 'dark' | 'system';
                                    setThemeMode(newMode);
                                    localStorage.setItem('themeMode', newMode);
                                    logger.log(`🎨 Theme mode changed to: ${newMode}`);
                                }}
                            >
                                <FormControlLabel
                                    value="system"
                                    control={<Radio/>}
                                    label={t('menu.themeDialog.system')}
                                />
                                <FormControlLabel
                                    value="light"
                                    control={<Radio/>}
                                    label={t('menu.themeDialog.light')}
                                />
                                <FormControlLabel
                                    value="dark"
                                    control={<Radio/>}
                                    label={t('menu.themeDialog.dark')}
                                />
                            </RadioGroup>
                        </FormControl>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setThemeDialogOpen(false)}>
                            {t('menu.themeDialog.close')}
                        </Button>
                    </DialogActions>
                </Dialog>

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

                {/* Main content, between the top and bottom bars */}
                <Toolbar/>
                {isLoadingStorage ? (
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 1,
                            gap: 2
                        }}
                    >
                        <CircularProgress size={48}/>
                        <Typography variant="body2" color="text.secondary">
                            {t('loading.tracks')}
                        </Typography>
                    </Box>
                ) : tracks.length === 0 ? (
                    <Box sx={{flex: 1, overflowY: 'auto', pt: 4}}>
                        <Box sx={{textAlign: 'center', py: 4, mb: 4}}>
                            <Typography variant="h5" color="text.secondary" gutterBottom>
                                {t('app.noTracksTitle')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t('app.noTracksMessage')}
                            </Typography>
                        </Box>
                        <TrackAdder/>
                    </Box>
                ) : (
                    <>
                        {/* Markers and loops list */}
                        <MarkersPanel/>
                        <Timeline/>
                    </>
                )}
                <Toolbar/>

                {/* Full-screen dropzone when dragging files */}
                <FullScreenDropZone 
                    isDragging={isDraggingFile} 
                    onDragLeave={() => setIsDraggingFile(false)}
                />

                {/* Bottom control bar */}
                <BottomControlBar/>
            </Box>
        </ThemeProvider>
    );
}

export default App;
