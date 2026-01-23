import { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Grid,
  Typography,
  Slider,
  IconButton,
  Button,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PlaybackSpeedDrawerProps {
  open: boolean;
  currentRate: number;
  onClose: () => void;
  onRateChange: (rate: number) => void;
}

const SLOW_SPEEDS = [0.5, 0.7, 0.8, 0.9];
const NORMAL_SPEED = [1.0];
const FAST_SPEEDS = [1.1, 1.25, 1.5, 2.0];

const PlaybackSpeedDrawer = ({ open, currentRate, onClose, onRateChange }: PlaybackSpeedDrawerProps) => {
  const { t } = useTranslation();
  const [customRate, setCustomRate] = useState(currentRate);

  // Sync with current rate when it changes
  useEffect(() => {
    setCustomRate(currentRate);
  }, [currentRate]);

  const handlePresetClick = (rate: number) => {
    onRateChange(rate);
    setCustomRate(rate);
    onClose(); // Close drawer after preset selection
  };

  const handleSliderChange = (_: Event, value: number | number[]) => {
    const rate = (value as number) / 100;
    setCustomRate(rate);
  };

  const handleSliderCommitted = (_: Event | React.SyntheticEvent, value: number | number[]) => {
    const rate = (value as number) / 100;
    onRateChange(rate);
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
        } else if (e.key === 'Escape') {
          onClose();
        }
      }}
      sx={{
        '& .MuiDrawer-paper': {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '70vh',
        },
      }}
    >
      <Box 
        sx={{ width: '100%', p: 3 }} 
        role="presentation"
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6">{t('speed.title')}</Typography>
          <IconButton size="small" onClick={onClose}>
            <Close />
          </IconButton>
        </Box>

        {/* Slider */}
        <Box sx={{ mb: 3, px: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('speed.custom')}: {customRate.toFixed(2)}x
          </Typography>
          <Slider
            value={customRate * 100}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderCommitted}
            min={50}
            max={200}
            step={5}
            marks={[
              { value: 100, label: '1x' },
            ]}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${(value / 100).toFixed(2)}x`}
          />
        </Box>

        {/* Preset speeds in three columns */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('speed.presets')}
        </Typography>
        <Grid container spacing={2}>
          {/* Slow speeds - Left column */}
          <Grid size={{ xs: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('speed.slower')}
              </Typography>
              {SLOW_SPEEDS.map((speed) => (
                <Button
                  key={speed}
                  variant={Math.abs(currentRate - speed) < 0.01 ? 'contained' : 'text'}
                  onClick={() => handlePresetClick(speed)}
                  size="small"
                  sx={{ 
                    minWidth: 80, 
                    width: '100%', 
                    maxWidth: 100,
                    textTransform: 'none',
                    color: Math.abs(currentRate - speed) < 0.01 ? undefined : 'text.primary',
                  }}
                >
                  {speed}x
                </Button>
              ))}
            </Box>
          </Grid>

          {/* Normal speed - Center column */}
          <Grid size={{ xs: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('speed.normal')}
              </Typography>
              {NORMAL_SPEED.map((speed) => (
                <Button
                  key={speed}
                  variant={Math.abs(currentRate - speed) < 0.01 ? 'contained' : 'text'}
                  onClick={() => handlePresetClick(speed)}
                  size="small"
                  sx={{ 
                    minWidth: 80, 
                    width: '100%', 
                    maxWidth: 100,
                    textTransform: 'none',
                    color: Math.abs(currentRate - speed) < 0.01 ? undefined : 'text.primary',
                  }}
                >
                  {speed}x
                </Button>
              ))}
            </Box>
          </Grid>

          {/* Fast speeds - Right column */}
          <Grid size={{ xs: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('speed.faster')}
              </Typography>
              {FAST_SPEEDS.map((speed) => (
                <Button
                  key={speed}
                  variant={Math.abs(currentRate - speed) < 0.01 ? 'contained' : 'text'}
                  onClick={() => handlePresetClick(speed)}
                  size="small"
                  sx={{ 
                    minWidth: 80, 
                    width: '100%', 
                    maxWidth: 100,
                    textTransform: 'none',
                    color: Math.abs(currentRate - speed) < 0.01 ? undefined : 'text.primary',
                  }}
                >
                  {speed}x
                </Button>
              ))}
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Drawer>
  );
};

export default PlaybackSpeedDrawer;
