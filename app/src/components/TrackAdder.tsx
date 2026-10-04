import { useCallback } from 'react';
import { Button, Flex, Text } from '@mantine/core';
import { IconMicrophone, IconPlus } from '@tabler/icons-react';
import { useAudioStore } from '../hooks/useAudioStore';
import { useTranslation } from 'react-i18next';

const TrackAdder = () => {
  const { addTrack, addRecordableTrack, tracks, isRecordingSupported } = useAudioStore();
  const { t } = useTranslation();

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

  if (tracks.length >= 8) {
    return null;
  }

  return (
    <div style={{ paddingBottom: 'var(--mantine-spacing-xl)' }}>
      {/* Track counter - always visible */}
      <Text size="sm" c="dimmed" ta="center" mb="md">
        {t('track.count', { current: tracks.length, max: 8 })}
      </Text>

      {/* Buttons */}
      <Flex direction={{ base: 'column', xs: 'row' }} gap="md" justify="center" px="md">
        {/* Import audio file button */}
        <Button
          variant="outline"
          leftSection={<IconPlus size={18} />}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          {t('track.importAudioTrack')}
        </Button>

        {/* Add recordable track button */}
        {isRecordingSupported && (
          <Button
            variant="outline"
            leftSection={<IconMicrophone size={18} />}
            onClick={addRecordableTrack}
          >
            {t('track.addRecordableTrack')}
          </Button>
        )}
      </Flex>

      {/* Hidden file input */}
      <input
        id="file-input"
        type="file"
        accept="audio/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  );
};

export default TrackAdder;
