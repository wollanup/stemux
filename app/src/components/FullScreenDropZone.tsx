import { useCallback } from 'react';
import { Text, Title } from '@mantine/core';
import { IconCloudUpload } from '@tabler/icons-react';
import { useAudioStore } from '../hooks/useAudioStore';
import { useTranslation } from 'react-i18next';

interface FullScreenDropZoneProps {
  isDragging: boolean;
  onDragLeave: () => void;
}

const FullScreenDropZone = ({ isDragging, onDragLeave }: FullScreenDropZoneProps) => {
  const { addTrack, tracks } = useAudioStore();
  const { t } = useTranslation();

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files);
      files.forEach((file) => {
        if (file.type.includes('audio') && tracks.length < 8) {
          addTrack(file);
        }
      });
      onDragLeave();
    },
    [addTrack, tracks.length, onDragLeave]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!isDragging || tracks.length >= 8) {
    return null;
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'all',
        border: '4px dashed var(--mantine-primary-color-filled)',
      }}
    >
      <IconCloudUpload size={120} color="var(--mantine-primary-color-filled)" style={{ marginBottom: 24 }} />
      <Title order={1} c="white" mb="xs">
        {t('upload.dropHere')}
      </Title>
      <Text size="xl" c="rgba(255, 255, 255, 0.7)">
        {t('upload.description')}
      </Text>
      <Text c="rgba(255, 255, 255, 0.5)" mt="lg">
        {t('track.count', { current: tracks.length, max: 8 })}
      </Text>
    </div>
  );
};

export default FullScreenDropZone;
