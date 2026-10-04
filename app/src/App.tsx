import {useEffect, useState} from 'react';
import {Box, Button, Group, Loader, Modal, Radio, Stack, Text, Title, useComputedColorScheme, useMantineColorScheme, type MantineColorScheme} from '@mantine/core';
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
import ConfirmDialog from './components/ConfirmDialog';
import {useMedia} from './theme/palette';
import classes from './App.module.css';

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

    // Light / dark / system (saved by Mantine under 'themeMode')
    const {colorScheme, setColorScheme} = useMantineColorScheme();
    const prefersDarkMode = useComputedColorScheme('light', {getInitialValueInEffect: false}) === 'dark';

    const isMobile = useMedia('(max-width:899px)'); // Mobile/tablet breakpoint

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
        <>
            <PWAUpdatePrompt/>
            <Box style={{display: 'flex', flexDirection: 'column', height: '100dvh'}}>
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
                <PiecesManager open={piecesManagerOpen} onClose={() => setPiecesManagerOpen(false)} />
                <RecordingPermissionGuide
                    open={recordingGuideOpen}
                    onClose={() => setRecordingGuideOpen(false)}
                />

                {/* Interface Settings Modal */}
                <SettingsUI open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)}/>

                {/* Theme Selection Dialog */}
                <Modal
                    opened={themeDialogOpen}
                    onClose={() => setThemeDialogOpen(false)}
                    size="xs"
                    title={t('menu.themeDialog.title')}
                >
                    <Radio.Group
                        value={colorScheme}
                        onChange={(value) => {
                            const newMode = value as MantineColorScheme;
                            setColorScheme(newMode);
                            logger.log(`🎨 Theme mode changed to: ${newMode}`);
                        }}
                    >
                        <Stack gap="sm" mt="xs">
                            <Radio value="auto" label={t('menu.themeDialog.system')}/>
                            <Radio value="light" label={t('menu.themeDialog.light')}/>
                            <Radio value="dark" label={t('menu.themeDialog.dark')}/>
                        </Stack>
                    </Radio.Group>
                    <Group justify="flex-end" mt="lg">
                        <Button variant="subtle" onClick={() => setThemeDialogOpen(false)}>
                            {t('menu.themeDialog.close')}
                        </Button>
                    </Group>
                </Modal>

                {/* Delete All Tracks Confirmation Dialog */}
                <ConfirmDialog
                    opened={deleteAllDialogOpen}
                    onClose={() => setDeleteAllDialogOpen(false)}
                    onConfirm={async () => {
                        await removeAllTracks();
                        setDeleteAllDialogOpen(false);
                    }}
                    title={t('menu.deleteAllConfirmTitle')}
                    message={t('menu.deleteAllConfirmMessage')}
                    cancelLabel={t('track.cancelButton')}
                    confirmLabel={t('menu.deleteAllConfirmButton')}
                />

                {/* Main content, between the top and bottom bars */}
                <div className={classes.toolbarSpacer}/>
                {isLoadingStorage ? (
                    <Stack align="center" justify="center" flex={1} gap="md">
                        <Loader size={48}/>
                        <Text size="sm" c="dimmed">
                            {t('loading.tracks')}
                        </Text>
                    </Stack>
                ) : tracks.length === 0 ? (
                    <Box flex={1} pt="xl" style={{overflowY: 'auto'}}>
                        <Box ta="center" py="xl" mb="xl">
                            <Title order={3} c="dimmed" fw={400} mb="xs">
                                {t('app.noTracksTitle')}
                            </Title>
                            <Text size="sm" c="dimmed">
                                {t('app.noTracksMessage')}
                            </Text>
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
                <div className={classes.toolbarSpacer}/>

                {/* Full-screen dropzone when dragging files */}
                <FullScreenDropZone
                    isDragging={isDraggingFile}
                    onDragLeave={() => setIsDraggingFile(false)}
                />

                {/* Bottom control bar */}
                <BottomControlBar/>
            </Box>
        </>
    );
}

export default App;
