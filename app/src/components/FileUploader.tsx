import { useCallback } from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useAudioStore } from '../hooks/useAudioStore';
import { useTranslation } from 'react-i18next';

const FileUploader = () => {
  const { addTrack, tracks } = useAudioStore();
  const { t } = useTranslation();

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      files.forEach((file) => {
        if (file.type.includes('audio') && tracks.length < 8) {
          addTrack(file);
        }
      });
    },
    [addTrack, tracks.length]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach((file) => {
        if (tracks.length < 8) {
          addTrack(file);
        }
      });
    },
    [addTrack, tracks.length]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  if (tracks.length >= 8) {
    return null;
  }

  // Compact mode when tracks are loaded
  const isCompact = tracks.length > 0;

  return (
    <Paper
      elevation={0}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      sx={{
        p: isCompact ? 2 : 4,
        mb: 2,
        border: '2px dashed',
        borderColor: 'primary.main',
        bgcolor: 'background.default',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          bgcolor: 'action.hover',
          borderColor: 'primary.dark',
        },
      }}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept="audio/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {isCompact ? (
        // Compact mode: just icon + text on one line
        <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
          <Add sx={{ fontSize: 24, color: 'primary.main' }} />
          <Typography variant="body2" color="text.secondary">
            {t('upload.title')} ({tracks.length}/8)
          </Typography>
        </Box>
      ) : (
        // Full mode: large icon + multiple lines
        <>
          <Add sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {t('upload.description')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ({tracks.length}/8 tracks)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            Supports MP3, WAV, OGG, etc.
          </Typography>
        </>
      )}
    </Paper>
  );
};

export default FileUploader;
