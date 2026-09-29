import { memo } from 'react';
import { Box } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AudioTrack } from '../types/audio';
import TrackHeader from './TrackHeader';
import TrackLane from './TrackLane';
import { useTrackAudio } from './useTrackAudio';
import { COLLAPSED_LANE_HEIGHT, HEADER_WIDTH, LANE_HEIGHT, LANE_HEIGHT_MOBILE } from './layout';

interface TrackRowProps {
  track: AudioTrack;
  wide: boolean;
  contentWidth: number;
  viewportWidth: number;
  pxPerSec: number;
  dimmed: boolean;
}

/** Header + lane of one track; the unit reordered by drag & drop */
function TrackRow({ track, wide, contentWidth, viewportWidth, pxPerSec, dimmed }: TrackRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  const audio = useTrackAudio(track);
  const collapsed = track.isCollapsed ?? false;
  const laneHeight = collapsed ? COLLAPSED_LANE_HEIGHT : wide ? LANE_HEIGHT : LANE_HEIGHT_MOBILE;
  const headerOffset = wide ? HEADER_WIDTH : 0;

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
          width: wide ? HEADER_WIDTH : viewportWidth,
          flexShrink: 0,
        }}
      >
        {header}
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
    </Box>
  );
}

export default memo(TrackRow);
