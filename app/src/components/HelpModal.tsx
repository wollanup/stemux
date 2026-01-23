import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Stack,
  Divider,
  Chip,
  useMediaQuery,
} from '@mui/material';
import { Close, Headset, VolumeUp, Loop, Speed } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

const HelpModal = ({ open, onClose }: HelpModalProps) => {
  const { t } = useTranslation();

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Box mb={3}>
      <Typography variant="h6" gutterBottom color="primary" fontWeight={600}>
        {title}
      </Typography>
      {children}
    </Box>
  );

  const ControlItem = ({ 
    icon, 
    title, 
    description 
  }: { 
    icon: React.ReactNode; 
    title: string; 
    description: string;
  }) => (
    <Stack direction="row" spacing={2} mb={2} alignItems="flex-start">
      <Box
        sx={{
          minWidth: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'primary.main',
          color: 'white',
          borderRadius: 1,
        }}
      >
        {icon}
      </Box>
      <Box flex={1}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
    </Stack>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={useMediaQuery('(max-width:600px)')}
      scroll="paper"
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h5" fontWeight={600}>
            {t('help.title')}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {/* Welcome */}
        <Section title={t('help.sections.welcome.title')}>
          <Typography variant="body1" paragraph>
            {t('help.sections.welcome.description')}
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Getting Started */}
        <Section title={t('help.sections.basics.title')}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('help.sections.basics.uploadTitle')}
          </Typography>
          <Typography variant="body2" paragraph color="text.secondary">
            {t('help.sections.basics.uploadDesc')}
          </Typography>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom mt={2}>
            {t('help.sections.basics.playbackTitle')}
          </Typography>
          <Typography variant="body2" paragraph color="text.secondary">
            {t('help.sections.basics.playbackDesc')}
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Track Controls */}
        <Section title={t('help.sections.tracks.title')}>
          <ControlItem
            icon={<Headset />}
            title={t('help.sections.tracks.soloTitle')}
            description=""
          />
          <Box ml={7} mb={2}>
            <Stack spacing={1}>
              <Typography variant="body2">
                • {t('help.sections.tracks.soloShort')}
              </Typography>
              <Typography variant="body2">
                • {t('help.sections.tracks.soloLong')}
              </Typography>
            </Stack>
          </Box>

          <ControlItem
            icon={<VolumeUp />}
            title={t('help.sections.tracks.muteTitle')}
            description=""
          />
          <Box ml={7} mb={2}>
            <Stack spacing={1}>
              <Typography variant="body2">
                • {t('help.sections.tracks.muteShort')}
              </Typography>
              <Typography variant="body2">
                • {t('help.sections.tracks.muteLong')}
              </Typography>
            </Stack>
          </Box>

          <ControlItem
            icon={<Speed />}
            title={t('help.sections.tracks.volumeTitle')}
            description={t('help.sections.tracks.volumeDesc')}
          />
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Loop System */}
        <Section title={t('help.sections.loops.title')}>
          <ControlItem
            icon={<Loop />}
            title={t('help.sections.loops.openTitle')}
            description={t('help.sections.loops.openDesc')}
          />

          <Typography variant="subtitle1" fontWeight={600} gutterBottom mt={3}>
            {t('help.sections.loops.setTitle')}
          </Typography>
          <Stack spacing={1} ml={2} mb={2}>
            <Typography variant="body2">
              {t('help.sections.loops.setStep1')}
            </Typography>
            <Typography variant="body2">
              {t('help.sections.loops.setStep2')}
            </Typography>
            <Typography variant="body2">
              {t('help.sections.loops.setStep3')}
            </Typography>
          </Stack>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('help.sections.loops.activeTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('help.sections.loops.activeDesc')}
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Keyboard Shortcuts */}
        <Section title={t('help.sections.keyboard.title')}>
          <Stack direction="row" spacing={1} mb={1} alignItems="center">
            <Chip label="SPACE" size="small" />
            <Typography variant="body2">
              {t('help.sections.keyboard.space')}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" fontStyle="italic">
            {t('help.sections.keyboard.more')}
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Tips */}
        <Section title={t('help.sections.tips.title')}>
          <Stack spacing={1}>
            <Typography variant="body2">
              💡 {t('help.sections.tips.tip1')}
            </Typography>
            <Typography variant="body2">
              💾 {t('help.sections.tips.tip2')}
            </Typography>
            <Typography variant="body2">
              ⏮️ {t('help.sections.tips.tip3')}
            </Typography>
            <Typography variant="body2">
              🎯 {t('help.sections.tips.tip4')}
            </Typography>
          </Stack>
        </Section>
      </DialogContent>
    </Dialog>
  );
};

export default HelpModal;
