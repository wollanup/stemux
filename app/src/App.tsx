import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    Alert,
    AlertTitle,
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
    ThemeProvider,
    Typography,
    useMediaQuery,
    Radio,
    RadioGroup,
    FormControlLabel,
    FormControl
} from '@mui/material';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {restoreTracks, useAudioStore} from './hooks/useAudioStore';
import {useSyncWaveformScroll} from './hooks/useSyncWaveformScroll';
import FileUploader from './components/FileUploader';
import AudioTrack from './components/AudioTrack';
import BottomControlBar from './components/BottomControlBar';
import MarkersPanel from './components/MarkersPanel';
import {PWAUpdatePrompt} from './components/PWAUpdatePrompt';
import HelpModal from './components/HelpModal';
import SettingsUI from './components/SettingsUI';
import PiecesManager from './components/PiecesManager';
import {useTranslation} from 'react-i18next';
import {logger} from './utils/logger';
import TopBar from "./components/TopBar.tsx";

// Declarations for version info (defined by Vite, may be used later)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __APP_VERSION__: string;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __BUILD_DATE__: string;

// Zoom presets with logarithmic slider positions
const ZOOM_PRESETS = [
    {zoom: 0, slider: 0},
    {zoom: 1, slider: 5},
    {zoom: 5, slider: 20},
    {zoom: 10, slider: 40},
    {zoom: 50, slider: 60},
    {zoom: 250, slider: 80},
    {zoom: 500, slider: 100}
];

function App() {
    const {t} = useTranslation();
    const {tracks, initAudioContext, loopState, toggleLoopEditMode, zoomLevel, removeAllTracks, reorderTracks, playbackState} = useAudioStore();

    // DND Kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Handle drag end
    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;

        if (over && active.id !== over.id) {
            const oldIndex = tracks.findIndex(t => t.id === active.id);
            const newIndex = tracks.findIndex(t => t.id === over.id);
            reorderTracks(oldIndex, newIndex);
        }
    };

    // Drag and drop state for track reordering - REMOVED, using dnd-kit now
    // const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    // const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Handle window-wide drag and drop for audio files
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
            useAudioStore.setState({zoomLevel: preset.zoom});
        } else {
            // Fallback for manual slider adjustments between presets
            if (newSliderValue === 0) {
                useAudioStore.setState({zoomLevel: 0});
            } else {
                const zoom = Math.round(Math.pow(2.74, newSliderValue / 20));
                useAudioStore.setState({zoomLevel: Math.min(zoom, 500)});
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
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [themeDialogOpen, setThemeDialogOpen] = useState(false);
    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [piecesManagerOpen, setPiecesManagerOpen] = useState(false);
    const [showEditModeAlert, setShowEditModeAlert] = useState(() => {
        return localStorage.getItem('hideEditModeAlert') !== 'true';
    });
    const containerRef = useRef<HTMLDivElement>(null);

    const hasLoadedTracks = tracks.length > 0;

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
        window.addEventListener('wheel', handleWheel, {passive: false});

        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, [tracks.length, zoomLevel, zoomIn, zoomOut]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            <PWAUpdatePrompt/>
            <Box sx={{display: 'flex', flexDirection: 'column', minHeight: '100vh'}}>
                {/* Top App Bar */}
                <TopBar
                    hasLoadedTracks={hasLoadedTracks}
                    zoomLevel={zoomLevel}
                    sliderValue={sliderValue}
                    loopEditMode={loopState.editMode}
                    prefersDarkMode={prefersDarkMode}
                    isMobile={isMobile}
                    tracksCount={tracks.length}
                    isPlaying={playbackState.isPlaying}
                    duration={playbackState.duration}
                    onZoomOut={zoomOut}
                    onZoomIn={zoomIn}
                    onZoomChange={handleZoomChange}
                    onSliderDragStart={(value: number) => {
                        setIsDraggingSlider(true);
                        setDragSliderValue(value);
                    }}
                    onSliderDragEnd={() => setIsDraggingSlider(false)}
                    onToggleLoopEditMode={toggleLoopEditMode}
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

                {/* Main content */}
                <Container
                    ref={containerRef}
                    maxWidth="xl"
                    sx={{
                        pt: 10,
                        pb: 10,
                        flex: 1,
                        overflowX: zoomLevel > 0 ? 'auto' : 'visible',
                        overflowY: 'visible'
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
                                gap: 2
                            }}
                        >
                            <CircularProgress size={48}/>
                            <Typography variant="body2" color="text.secondary">
                                {t('loading.tracks')}
                            </Typography>
                        </Box>
                    ) : tracks.length === 0 ? (
                        <Box>
                            <FileUploader isDraggingWindow={isDraggingFile}/>
                            <Box
                                sx={{
                                    textAlign: 'center',
                                    py: 4
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
                            <MarkersPanel/>

                            {/* Edit Mode Alert */}
                            <Collapse in={loopState.editMode && showEditModeAlert}>
                                <Alert
                                    severity="warning"
                                    onClose={() => {
                                        setShowEditModeAlert(false);
                                        localStorage.setItem('hideEditModeAlert', 'true');
                                    }}
                                    sx={{mx: 2, mt: 2}}
                                >
                                    <AlertTitle>Mode Édition</AlertTitle>
                                    Cliquez sur la forme d'onde pour créer des repères et boucles. <a href="#"
                                                                                                      onClick={(e) => {
                                                                                                          e.preventDefault();
                                                                                                          setHelpModalOpen(true);
                                                                                                      }}
                                                                                                      style={{color: 'inherit'}}>Plus
                                    d'infos</a>
                                </Alert>
                            </Collapse>

                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={tracks.map(t => t.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {tracks.map((track) => (
                                        <AudioTrack
                                            key={track.id}
                                            track={track}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            {/* File uploader at bottom when tracks exist */}
                            <FileUploader isDraggingWindow={isDraggingFile}/>
                        </Box>
                    )}
                </Container>

                {/* Bottom control bar */}
                <BottomControlBar/>
            </Box>
        </ThemeProvider>
    );
}

export default App;
