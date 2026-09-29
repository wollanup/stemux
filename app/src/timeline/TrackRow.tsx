import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AudioTrack } from '../types/audio';
import TrackHeader from './TrackHeader';
import TrackLane from './TrackLane';
import { useTrackAudio } from './useTrackAudio';
import { clampLaneHeight, COLLAPSED_LANE_HEIGHT, LANE_HEIGHT, LANE_HEIGHT_MOBILE } from './layout';
import ResizeHandle from './ResizeHandle';
import { useAudioStore } from '../hooks/useAudioStore';

interface TrackRowProps {
  track: AudioTrack;
  wide: boolean;
  /** Header column width (large screens) */
  headerWidth: number;
  headerResize: { onResize: (delta: number) => void; onEnd: () => void; onReset: () => void };
  contentWidth: number;
  viewportWidth: number;
  pxPerSec: number;
  dimmed: boolean;
}

/** Header + lane of one track; the unit reordered by drag & drop */
function TrackRow({ track, wide, headerWidth, headerResize, contentWidth, viewportWidth, pxPerSec, dimmed }: TrackRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  const audio = useTrackAudio(track);
  const updateTrack = useAudioStore((s) => s.updateTrack);
  const collapsed = track.isCollapsed ?? false;

  // Height: set by the user per track (saved with the piece), live while dragging
  const defaultHeight = wide ? LANE_HEIGHT : LANE_HEIGHT_MOBILE;
  const savedHeight = track.height ?? defaultHeight;
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const laneHeight = collapsed ? COLLAPSED_LANE_HEIGHT : (dragHeight ?? savedHeight);
  const headerOffset = wide ? headerWidth : 0;

  const header = (
    <TrackHeader
      track={track}
      variant={wide ? 'column' : 'row'}
      height={wide ? laneHeight : undefined}
      dimmed={dimmed}
      dragHandle={{ attributes, listeners, isDragging }}
    />
  );

  return (
    <Box
      ref={setNodeRef}
      data-track-row={track.name}
      data-track-height={laneHeight}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        display: 'flex',
        flexDirection: wide ? 'row' : 'column',
        position: 'relative',
        zIndex: isDragging ? 10 : 'auto',
        boxShadow: isDragging ? 8 : 'none',
      }}
    >
      {/* Header stays visible while scrolling horizontally */}
      <Box
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 3,
          width: wide ? headerWidth : viewportWidth,
          flexShrink: 0,
        }}
      >
        {header}
        {wide && <ResizeHandle axis="x" label={t('track.resizeHeaders')} {...headerResize} />}
      </Box>
      <TrackLane
        track={track}
        audio={audio}
        width={contentWidth}
        height={laneHeight}
        pxPerSec={pxPerSec}
        dimmed={dimmed}
        headerOffset={headerOffset}
      />
      {!collapsed && (
        <ResizeHandle
          axis="y"
          label={t('track.resizeHeight')}
          onResize={(delta) => setDragHeight(clampLaneHeight(savedHeight + delta))}
          onEnd={() => {
            if (dragHeight !== null && dragHeight !== savedHeight) updateTrack(track.id, { height: dragHeight });
            setDragHeight(null);
          }}
          onReset={() => updateTrack(track.id, { height: undefined })}
        />
      )}
    </Box>
  );
}

export default memo(TrackRow);
