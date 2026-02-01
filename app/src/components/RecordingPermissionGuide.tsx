import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import MicIcon from '@mui/icons-material/Mic';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface RecordingPermissionGuideProps {
  open: boolean;
  onClose: () => void;
}

const RecordingPermissionGuide = ({ open, onClose }: RecordingPermissionGuideProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{t('recordingGuide.title')}</DialogTitle>
      
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            {t('recordingGuide.intro')}
          </Typography>
        </Alert>

        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
          {t('recordingGuide.stepsTitle')}
        </Typography>

        <List>
          <ListItem>
            <ListItemIcon>
              <PhoneAndroidIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary={t('recordingGuide.step1Title')}
              secondary={t('recordingGuide.step1Description')}
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <MicIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary={t('recordingGuide.step2Title')}
              secondary={t('recordingGuide.step2Description')}
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon color="success" />
            </ListItemIcon>
            <ListItemText
              primary={t('recordingGuide.step3Title')}
              secondary={t('recordingGuide.step3Description')}
            />
          </ListItem>
        </List>

        <Alert severity="warning" sx={{ mt: 3 }}>
          <Typography variant="body2">
            {t('recordingGuide.troubleshoot')}
          </Typography>
        </Alert>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {t('recordingGuide.footer')}
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          {t('recordingGuide.understood')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecordingPermissionGuide;
