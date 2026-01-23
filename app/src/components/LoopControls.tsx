import { useState } from 'react';
import {
  Button,
  Stack,
  Typography,
  Box,
} from '@mui/material';
import { PlayArrow, Stop, Loop as LoopIcon, SyncDisabled, Delete } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';

const LoopControls = () => {
  const { t } = useTranslation();
  const { loopRegion, setLoopRegion, playbackState, toggleLoop } = useAudioStore();
  const [isSettingLoop, setIsSettingLoop] = useState(false);
  const [loopStartTime, setLoopStartTime] = useState(0);
  
  const hasLoopDefined = loopRegion.start < loopRegion.end && loopRegion.end > 0;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLoopButtonClick = () => {
    if (!isSettingLoop) {
      // First click: mark loop start
      const currentTime = playbackState.currentTime;
      setLoopStartTime(currentTime);
      setIsSettingLoop(true);
      
      // Disable existing loop while setting new one
      if (loopRegion.enabled) {
        toggleLoop();
      }
    } else {
      // Second click: mark loop end and enable
      const currentTime = playbackState.currentTime;
      
      // Ensure end is after start (minimum 0.1s gap)
      if (currentTime > loopStartTime + 0.1) {
        setLoopRegion(loopStartTime, currentTime);
        toggleLoop(); // Enable loop
      } else {
        // Too short, cancel
        alert(t('loop.tooShort'));
      }
      
      setIsSettingLoop(false);
    }
  };

  const handleClearLoop = () => {
    // Reset loop region to initial state (start=0, end=0, enabled=false)
    setLoopRegion(0, 0);
    if (loopRegion.enabled) {
      toggleLoop();
    }
    setIsSettingLoop(false);
  };

  return (
    <Box>
      <Stack spacing={2}>
        {/* Main loop button - big and prominent */}
        <Button
          variant="contained"
          size="large"
          color={isSettingLoop ? 'error' : 'primary'}
          onClick={handleLoopButtonClick}
          startIcon={isSettingLoop ? <Stop /> : <PlayArrow />}
          sx={{ 
            py: 2,
            fontSize: '1.1rem',
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          {isSettingLoop ? t('loop.setEnd') : t('loop.setStart')}
        </Button>

        {/* Status display */}
        {isSettingLoop && (
          <Typography variant="body2" color="warning.main" textAlign="center" fontWeight={600}>
            ⏱ {t('loop.waitingForEnd')}: {formatTime(loopStartTime)}
          </Typography>
        )}
        
        {hasLoopDefined && !isSettingLoop && (
          <Box>
            {/* Loop info */}
            <Typography 
              variant="body2" 
              color="text.secondary"
              textAlign="center" 
              fontWeight={500}
              sx={{ mb: 1.5 }}
            >
              {t('loop.region')}: {formatTime(loopRegion.start)} → {formatTime(loopRegion.end)}
            </Typography>
            
            {/* Toggle and Clear buttons on same line */}
            <Stack direction="row" spacing={1}>
              {/* Toggle loop button */}
              <Button
                variant={loopRegion.enabled ? 'contained' : 'contained'}
                size="large"
                color={loopRegion.enabled ? 'success' : 'warning'}
                onClick={toggleLoop}
                startIcon={loopRegion.enabled ? <LoopIcon /> : <SyncDisabled />}
                sx={{ 
                  py: 1.5,
                  fontSize: '1rem',
                  textTransform: 'none',
                  fontWeight: 600,
                  flex: 1,
                }}
              >
                {loopRegion.enabled ? t('loop.enabled') : t('loop.disabled')}
              </Button>
              
              {/* Clear button */}
              <Button
                variant="outlined"
                size="large"
                color="error"
                onClick={handleClearLoop}
                startIcon={<Delete />}
                sx={{ 
                  py: 1.5,
                  fontSize: '1rem',
                  textTransform: 'none',
                  fontWeight: 600,
                  minWidth: 'auto',
                }}
              >
                {t('loop.clear')}
              </Button>
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default LoopControls;
