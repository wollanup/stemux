import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Close, GraphicEq, Timeline, PhotoSizeSelectSmall, Equalizer } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import RecordingLatencySetting from './RecordingLatencySetting';

interface SettingsUIProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsUI({ open, onClose }: SettingsUIProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const waveformStyle = useAudioStore(state => state.waveformStyle);
  const setWaveformStyle = useAudioStore(state => state.setWaveformStyle);
  const waveformNormalize = useAudioStore(state => state.waveformNormalize);
  const setWaveformNormalize = useAudioStore(state => state.setWaveformNormalize);
  const waveformTimeline = useAudioStore(state => state.waveformTimeline);
  const setWaveformTimeline = useAudioStore(state => state.setWaveformTimeline);
  const waveformMinimap = useAudioStore(state => state.waveformMinimap);
  const setWaveformMinimap = useAudioStore(state => state.setWaveformMinimap);
  const isRecordingSupported = useAudioStore(state => state.isRecordingSupported);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      disableRestoreFocus
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: `1px solid ${theme.palette.divider}`
      }}>
        {t('settings.title')}
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        <List sx={{ width: '100%' }}>
          {/* Waveform Style */}
          <ListItem
            sx={{
              py: 2,
              px: 3,
              '&:hover': {
                bgcolor: 'action.hover'
              }
            }}
          >
            <GraphicEq sx={{ mr: 2, color: 'text.secondary' }} />
            <ListItemText
              primary={
                <Typography variant="body1" fontWeight={500}>
                  {t('settings.waveformStyle.title')}
                </Typography>
              }
              secondary={
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('settings.waveformStyle.description')}
                </Typography>
              }
            />
            <Switch
              edge="end"
              checked={waveformStyle === 'modern'}
              onChange={(e) => setWaveformStyle(e.target.checked ? 'modern' : 'classic')}
            />
          </ListItem>

          {/* Normalize */}
          <ListItem
            sx={{
              py: 2,
              px: 3,
              '&:hover': {
                bgcolor: 'action.hover'
              }
            }}
          >
            <Equalizer sx={{ mr: 2, color: 'text.secondary' }} />
            <ListItemText
              primary={
                <Typography variant="body1" fontWeight={500}>
                  {t('settings.normalize.title')}
                </Typography>
              }
              secondary={
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('settings.normalize.description')}
                </Typography>
              }
            />
            <Switch
              edge="end"
              checked={waveformNormalize}
              onChange={(e) => setWaveformNormalize(e.target.checked)}
            />
          </ListItem>

          {/* Timeline */}
          <ListItem
            sx={{
              py: 2,
              px: 3,
              '&:hover': {
                bgcolor: 'action.hover'
              }
            }}
          >
            <Timeline sx={{ mr: 2, color: 'text.secondary' }} />
            <ListItemText
              primary={
                <Typography variant="body1" fontWeight={500}>
                  {t('settings.timeline.title')}
                </Typography>
              }
              secondary={
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('settings.timeline.description')}
                </Typography>
              }
            />
            <Switch
              edge="end"
              checked={waveformTimeline}
              onChange={(e) => setWaveformTimeline(e.target.checked)}
            />
          </ListItem>

          {/* Minimap */}
          <ListItem
            sx={{
              py: 2,
              px: 3,
              '&:hover': {
                bgcolor: 'action.hover'
              }
            }}
          >
            <PhotoSizeSelectSmall sx={{ mr: 2, color: 'text.secondary' }} />
            <ListItemText
              primary={
                <Typography variant="body1" fontWeight={500}>
                  {t('settings.minimap.title')}
                </Typography>
              }
              secondary={
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('settings.minimap.description')}
                </Typography>
              }
            />
            <Switch
              edge="end"
              checked={waveformMinimap}
              onChange={(e) => setWaveformMinimap(e.target.checked)}
            />
          </ListItem>

          {/* Recording latency compensation */}
          {isRecordingSupported && <RecordingLatencySetting />}
        </List>
      </DialogContent>
    </Dialog>
  );
}
