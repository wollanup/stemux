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
import { Close, Headset, VolumeUp, Loop, Speed, OpenWith, SwapHoriz } from '@mui/icons-material';
import MagnetIcon from './MagnetIcon';
import { useTranslation } from 'react-i18next';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

// Helper components defined OUTSIDE of render to avoid recreation
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

const HelpModal = ({ open, onClose }: HelpModalProps) => {
  const { t } = useTranslation();

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
          <Typography variant="body1" >
            {t('help.sections.welcome.description')}
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Pieces Management */}
        <Section title={t('help.sections.pieces.title')}>
          <Typography variant="body2" color="text.secondary">
            {t('help.sections.pieces.description')}
          </Typography>
        </Section>

        <Divider sx={{ my: 3 }} />

        {/* Getting Started */}
        <Section title={t('help.sections.basics.title')}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('help.sections.basics.uploadTitle')}
          </Typography>
          <Typography variant="body2"  color="text.secondary">
            {t('help.sections.basics.uploadDesc')}
          </Typography>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom mt={2}>
            {t('help.sections.basics.playbackTitle')}
          </Typography>
          <Typography variant="body2"  color="text.secondary">
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

        {/* Clips */}
        <Section title={t('help.sections.clips.title')}>
          <ControlItem icon={<OpenWith />} title={t('help.sections.clips.moveTitle')} description={t('help.sections.clips.moveDesc')} />
          <ControlItem icon={<SwapHoriz />} title={t('help.sections.clips.trimTitle')} description={t('help.sections.clips.trimDesc')} />
          <ControlItem icon={<MagnetIcon />} title={t('help.sections.clips.snapTitle')} description={t('help.sections.clips.snapDesc')} />
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
            {t('help.sections.loops.editTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t('help.sections.loops.editDesc')}
          </Typography>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('help.sections.loops.manageTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t('help.sections.loops.manageDesc')}
          </Typography>

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
          <Stack spacing={1} mb={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="SPACE" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.space')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="←" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.arrowLeft')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="→" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.arrowRight')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Ctrl + ←" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.ctrlLeft')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Ctrl + 🖱️" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.ctrlWheel')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Shift + 🖱️" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.altWheel')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Ctrl + Z" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.undo')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Ctrl + Shift + Z" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.redo')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Alt" size="small" />
              <Typography variant="body2">
                {t('help.sections.keyboard.altSnap')}
              </Typography>
            </Stack>
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
              🖱️ {t('help.sections.tips.tip4')}
            </Typography>
          </Stack>
        </Section>
      </DialogContent>
    </Dialog>
  );
};

export default HelpModal;
