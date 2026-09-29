import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  ListItem,
  ListItemText,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import { Timer } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import {
  calibrateRoundTripLatency,
  estimateRoundTripLatency,
  loadLatencyOverrideMs,
  saveLatencyOverrideMs,
} from '../audio/latency';

const MAX_LATENCY_MS = 500;

export default function RecordingLatencySetting() {
  const { t } = useTranslation();
  const [override, setOverride] = useState<number | null>(loadLatencyOverrideMs);
  const [calibrating, setCalibrating] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  const estimateMs = Math.round(estimateRoundTripLatency() * 1000);
  const isAuto = override === null;

  const update = (value: number | null) => {
    setOverride(value);
    saveLatencyOverrideMs(value);
  };

  const calibrate = async () => {
    setCalibrating(true);
    setMessage(null);
    try {
      const ms = await calibrateRoundTripLatency();
      update(ms);
      setMessage({ severity: 'success', text: t('settings.latency.calibrationDone', { ms }) });
    } catch (error) {
      console.error('Latency calibration failed:', error);
      setMessage({ severity: 'error', text: t('settings.latency.calibrationFailed') });
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <ListItem sx={{ py: 2, px: 3, flexDirection: 'column', alignItems: 'stretch' }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Timer sx={{ mr: 2, color: 'text.secondary' }} />
        <ListItemText
          primary={
            <Typography variant="body1" fontWeight={500}>
              {t('settings.latency.title')}
            </Typography>
          }
          secondary={
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {isAuto
                ? t('settings.latency.autoDescription', { ms: estimateMs })
                : t('settings.latency.manualDescription')}
            </Typography>
          }
        />
        <Typography variant="body2" sx={{ mr: 1 }}>{t('settings.latency.auto')}</Typography>
        <Switch
          edge="end"
          checked={isAuto}
          onChange={(e) => update(e.target.checked ? null : estimateMs)}
        />
      </Box>

      {!isAuto && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pl: 5, pr: 1, mt: 1 }}>
          <Slider
            value={override}
            min={0}
            max={MAX_LATENCY_MS}
            step={1}
            onChange={(_, value) => update(value as number)}
            aria-label={t('settings.latency.title')}
          />
          <Typography variant="body2" sx={{ minWidth: 64, textAlign: 'right' }}>
            {override} ms
          </Typography>
        </Box>
      )}

      <Box sx={{ pl: 5, mt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('settings.latency.calibrationHelp')}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={calibrate}
          disabled={calibrating}
          startIcon={calibrating ? <CircularProgress size={16} /> : undefined}
        >
          {calibrating ? t('settings.latency.calibrating') : t('settings.latency.calibrate')}
        </Button>
        {message && (
          <Alert severity={message.severity} sx={{ mt: 1 }}>
            {message.text}
          </Alert>
        )}
      </Box>
    </ListItem>
  );
}
