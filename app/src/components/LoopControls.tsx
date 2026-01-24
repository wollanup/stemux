import {Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography} from '@mui/material';
import {Delete, East as EastIcon, Flag, Loop as LoopIcon, SportsScore, SyncDisabled} from '@mui/icons-material';
import {useTranslation} from 'react-i18next';
import {useAudioStore} from '../hooks/useAudioStore';
import {useState} from 'react';

const LoopControls = () => {
    const {t} = useTranslation();
    const {loopRegion, setLoopRegion, startSettingLoop, cancelSettingLoop, playbackState, toggleLoop} = useAudioStore();
    const [adjustMode, setAdjustMode] = useState<'position' | 'duration'>('position');

    const hasLoopDefined = loopRegion.start < loopRegion.end && loopRegion.end > 0;

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(1);
        return `${mins}:${secs.padStart(4, '0')}`;
    };

    const handleLoopButtonClick = () => {
        if (!loopRegion.isSettingLoop) {
            // Clear existing loop completely before starting new one
            if (hasLoopDefined) {
                setLoopRegion(0, 0);
                if (loopRegion.enabled) {
                    toggleLoop();
                }
            }

            // First click: mark loop start
            const currentTime = playbackState.currentTime;
            startSettingLoop(currentTime);
        } else {
            // Second click: mark loop end and enable
            const currentTime = playbackState.currentTime;

            // Ensure end is after start (minimum 0.1s gap)
            if (currentTime > loopRegion.loopStartMarker + 0.1) {
                setLoopRegion(loopRegion.loopStartMarker, currentTime);
                toggleLoop(); // Enable loop
            } else {
                // Too short, cancel
                alert(t('loop.tooShort'));
                cancelSettingLoop();
            }
        }
    };

    const handleSeekToMarker = () => {
        const {seek} = useAudioStore.getState();
        seek(loopRegion.loopStartMarker);
    };

    const adjustLoop = (type: 'position' | 'duration', delta: number) => {
        if (type === 'position') {
            // Shift both start and end
            const newStart = Math.max(0, loopRegion.start + delta);
            const newEnd = Math.max(newStart + 0.1, loopRegion.end + delta);
            setLoopRegion(newStart, newEnd);
        } else {
            // Adjust end only (duration)
            const newEnd = Math.max(loopRegion.start + 0.1, loopRegion.end + delta);
            setLoopRegion(loopRegion.start, newEnd);
        }
    };

    const handleClearLoop = () => {
        // Reset loop region to initial state (start=0, end=0, enabled=false)
        setLoopRegion(0, 0);
        if (loopRegion.enabled) {
            toggleLoop();
        }
        cancelSettingLoop();
    };

    return (
        <Box>
            <Stack spacing={2}>
                {/* Main loop button - big and prominent */}
                <Button
                    variant="contained"
                    size="large"
                    color={loopRegion.isSettingLoop ? 'warning' : 'primary'}
                    onClick={handleLoopButtonClick}
                    startIcon={loopRegion.isSettingLoop ? <SportsScore/> : <Flag/>}
                    sx={{
                        py: 2,
                        fontSize: '1.1rem',
                        textTransform: 'none',
                        fontWeight: 600
                    }}
                >
                    {loopRegion.isSettingLoop ? t('loop.setEnd') : t('loop.setStart')}
                    {formatTime(playbackState.currentTime)}
                </Button>


                {/* Fine-tune controls - shown when loop is defined */}
                {hasLoopDefined && !loopRegion.isSettingLoop && (
                    <Box sx={{mt: 2}}>
                        {/* Desktop: 2 columns, Mobile: stacked */}
                        <Stack direction={{xs: 'column', md: 'row'}} spacing={2}>
                            {/* Left column: Fine-tune controls + loop info */}
                            <Box sx={{flex: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1}}>
                                {/* Loop info */}
                                <Stack direction="row" spacing={2} alignItems="center"
                                       sx={{justifyContent: 'center', mb: 2}}>
                                    <Typography variant="body1" fontWeight={500} color="text.secondary">
                                        {formatTime(loopRegion.start)}
                                    </Typography>
                                    <EastIcon fontSize="small" sx={{color: 'text.secondary'}}/>
                                    <Typography variant="body1" fontWeight={500} color="text.secondary">
                                        {formatTime(loopRegion.end)}
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary">
                                        ({formatTime(loopRegion.end - loopRegion.start)})
                                    </Typography>
                                </Stack>

                                {/* Mode toggle */}
                                <ToggleButtonGroup
                                    value={adjustMode}
                                    exclusive
                                    onChange={(_, val) => val && setAdjustMode(val)}
                                    size="small"
                                    fullWidth
                                    sx={{mb: 2}}
                                >
                                    <ToggleButton value="position">{t('loop.position')}</ToggleButton>
                                    <ToggleButton value="duration">{t('loop.duration')}</ToggleButton>
                                </ToggleButtonGroup>

                                {/* Single row of adjustment buttons */}
                                <Stack direction="row" spacing={1.5} sx={{justifyContent: 'center'}}>
                                    <Button size="small"
                                            variant="outlined"
                                            color="inherit"
                                            onClick={() => adjustLoop(adjustMode, -1)}
                                    >
                                        -1
                                    </Button>
                                    <Button size="small"
                                            variant="outlined"
                                            color="inherit"
                                            onClick={() => adjustLoop(adjustMode, -0.5)}
                                    >
                                        -0.5
                                    </Button>
                                    <Button size="small"
                                            variant="outlined"
                                            color="inherit"
                                            onClick={() => adjustLoop(adjustMode, -0.1)}
                                    >
                                        -0.1
                                    </Button>
                                    <Button size="small"
                                            variant="outlined"
                                            color="inherit"
                                            onClick={() => adjustLoop(adjustMode, 0.1)}
                                    >
                                        +0.1
                                    </Button>
                                    <Button size="small"
                                            variant="outlined"
                                            color="inherit"
                                            onClick={() => adjustLoop(adjustMode, 0.5)}
                                    >
                                        +0.5
                                    </Button>
                                    <Button size="small"
                                            variant="outlined"
                                            color="inherit"
                                            onClick={() => adjustLoop(adjustMode, 1)}
                                    >
                                        +1
                                    </Button>
                                </Stack>
                            </Box>

                            {/* Right column: Toggle and Clear buttons */}
                            <Box sx={{flex: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1}}>
                                <Stack spacing={1.5}>
                                    {/* Toggle loop button */}
                                    <Button
                                        variant={loopRegion.enabled ? 'contained' : 'contained'}
                                        size="large"
                                        color={loopRegion.enabled ? 'success' : 'warning'}
                                        onClick={toggleLoop}
                                        startIcon={loopRegion.enabled ? <LoopIcon/> : <SyncDisabled/>}
                                        sx={{
                                            py: 2,
                                            fontSize: '1rem',
                                            textTransform: 'none',
                                            fontWeight: 600
                                        }}
                                    >
                                        {loopRegion.enabled ? t('loop.enabled') : t('loop.disabled')}
                                    </Button>

                                    {/* Clear loop button */}
                                    <Button
                                        variant="outlined"
                                        size="medium"
                                        color="error"
                                        onClick={handleClearLoop}
                                        startIcon={<Delete/>}
                                        sx={{textTransform: 'none'}}
                                    >
                                        {t('loop.clear')}
                                    </Button>
                                </Stack>
                            </Box>
                        </Stack>
                    </Box>
                )}

                {/* If marker exists, show button to seek to it */}
                {loopRegion.isSettingLoop && (<>
                        <Stack spacing={1.5} direction="row" alignItems="center" justifyContent="center">
                            <Button
                                variant="outlined"
                                onClick={handleSeekToMarker}
                                sx={{textTransform: 'none'}}
                            >
                                ⏱ {t('loop.goToMarker')} ({formatTime(loopRegion.loopStartMarker)})
                            </Button>
                            <Button
                                variant="outlined"
                                color="error"
                                onClick={handleClearLoop}
                                startIcon={<Delete/>}
                                sx={{textTransform: 'none'}}
                            >
                                {t('loop.clearMarker')}
                            </Button>
                            <Typography variant="body2" color="warning.main" textAlign="center" fontWeight={600}>
                                ⏱ {t('loop.waitingForEnd')}: {formatTime(loopRegion.loopStartMarker)}
                            </Typography>

                        </Stack>
                    </>
                )}
            </Stack>
        </Box>
    );
};

export default LoopControls;
