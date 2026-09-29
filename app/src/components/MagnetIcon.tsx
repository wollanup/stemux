import { SvgIcon, type SvgIconProps } from '@mui/material';

/** Horseshoe magnet (no magnet in the Material icon set) */
export default function MagnetIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 3h5v4H4zM15 3h5v4h-5zM4 8h5v4a3 3 0 0 0 6 0V8h5v4a8 8 0 0 1-16 0z" />
    </SvgIcon>
  );
}
