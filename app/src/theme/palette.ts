/**
 * Concrete colors of the current color scheme, for what CSS variables cannot
 * reach: canvas drawings and colors mixed in JS. Same values as the Mantine
 * CSS variables (text, dimmed, default-border, *-filled...).
 */

import { useMemo } from 'react';
import { isLightColor, useComputedColorScheme, useMantineTheme, type MantineBreakpoint } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

export interface AppPalette {
  dark: boolean;
  text: string;
  dimmed: string;
  border: string;
  /** Background of empty meters and tracks */
  surface: string;
  disabled: string;
  body: string;
  primary: string;
  error: string;
  warning: string;
  success: string;
}

export function useAppPalette(): AppPalette {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light', { getInitialValueInEffect: false }) === 'dark';
  return useMemo(() => {
    const c = theme.colors;
    const filled = (color: string) => c[color][dark ? 8 : 6];
    return {
      dark,
      text: dark ? c.dark[0] : theme.black,
      dimmed: dark ? c.dark[2] : c.gray[6],
      border: dark ? c.dark[4] : c.gray[3],
      surface: dark ? c.dark[5] : c.gray[2],
      disabled: dark ? c.dark[3] : c.gray[5],
      body: dark ? c.dark[7] : theme.white,
      primary: filled(theme.primaryColor),
      error: filled('red'),
      warning: filled('orange'),
      success: filled('green'),
    };
  }, [theme, dark]);
}

/** Text color readable on a background color */
export function contrastText(background: string): string {
  return isLightColor(background) ? 'var(--mantine-color-black)' : 'var(--mantine-color-white)';
}

/** Media query evaluated on the first render (no flash of the wrong layout) */
export function useMedia(query: string): boolean {
  return useMediaQuery(query, undefined, { getInitialValueInEffect: false });
}

/** Screen narrower than a Mantine breakpoint */
export function useSmallerThan(breakpoint: MantineBreakpoint): boolean {
  return useMedia(`(max-width: ${useMantineTheme().breakpoints[breakpoint]})`);
}
