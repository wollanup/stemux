import { alpha, type Theme } from '@mui/material';

/** Colors shared with the native vertical scrollbar */
export const scrollbarColors = (theme: Theme) => {
  const dark = theme.palette.mode === 'dark';
  return {
    track: dark ? alpha(theme.palette.common.black, 0.4) : alpha(theme.palette.text.primary, 0.06),
    thumb: alpha(theme.palette.text.primary, dark ? 0.25 : 0.3),
    thumbHover: alpha(theme.palette.text.primary, dark ? 0.4 : 0.45),
  };
};
