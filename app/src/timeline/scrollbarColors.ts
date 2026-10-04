import { alpha } from '@mantine/core';
import type { AppPalette } from '../theme/palette';

/** Colors shared with the native vertical scrollbar */
export const scrollbarColors = (palette: AppPalette) => {
  const { dark, text } = palette;
  return {
    track: dark ? alpha('#000', 0.4) : alpha(text, 0.06),
    thumb: alpha(text, dark ? 0.25 : 0.3),
    thumbHover: alpha(text, dark ? 0.4 : 0.45),
  };
};
