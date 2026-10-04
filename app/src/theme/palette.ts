/**
 * Concrete colors of the current color scheme, for what CSS variables cannot
 * reach: canvas drawings and colors mixed in JS. Same values as global.css.
 */

import { useMemo } from 'react';
import { isLightColor, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

export interface AppPalette {
  dark: boolean;
  text: string;
  textSecondary: string;
  divider: string;
  hover: string;
  selected: string;
  disabled: string;
  background: string;
  paper: string;
  primary: string;
  primaryLight: string;
  error: string;
  warning: string;
  warningLight: string;
  success: string;
}

export function useAppPalette(): AppPalette {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light', { getInitialValueInEffect: false }) === 'dark';
  return useMemo(() => {
    const c = theme.colors;
    return dark
      ? {
          dark,
          text: c.dark[0],
          textSecondary: c.dark[2],
          divider: c.dark[4],
          hover: 'rgba(255, 255, 255, 0.08)',
          selected: 'rgba(255, 255, 255, 0.16)',
          disabled: 'rgba(255, 255, 255, 0.3)',
          background: c.dark[9],
          paper: c.dark[7],
          primary: c.brand[7],
          primaryLight: c.brand[4],
          error: c.red[5],
          warning: c.orange[4],
          warningLight: c.orange[3],
          success: c.green[5],
        }
      : {
          dark,
          text: theme.black,
          textSecondary: c.gray[6],
          divider: c.gray[3],
          hover: 'rgba(0, 0, 0, 0.04)',
          selected: 'rgba(0, 0, 0, 0.08)',
          disabled: 'rgba(0, 0, 0, 0.26)',
          background: '#f5f5f5',
          paper: theme.white,
          primary: c.brand[7],
          primaryLight: c.brand[4],
          error: c.red[7],
          warning: c.orange[7],
          warningLight: c.orange[5],
          success: c.green[8],
        };
  }, [theme, dark]);
}

/** Text color readable on a background color (same threshold as MUI: contrast ratio 3 with white) */
export function contrastText(background: string): string {
  return isLightColor(background, 0.3) ? 'rgba(0, 0, 0, 0.87)' : '#fff';
}

/** Media query evaluated on the first render (no flash of the wrong layout) */
export function useMedia(query: string): boolean {
  return useMediaQuery(query, undefined, { getInitialValueInEffect: false });
}
