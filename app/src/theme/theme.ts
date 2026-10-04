import { createTheme, localStorageColorSchemeManager, type MantineColorsTuple } from '@mantine/core';

/** Material blue, #1976d2 at index 7 (the app primary color since its start) */
const brand: MantineColorsTuple = [
  '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5',
  '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
];

/** Mantine greys, with a darker body (#1e1e1e) and background (#121212) */
const dark: MantineColorsTuple = [
  '#C9C9C9', '#b8b8b8', '#828282', '#696969', '#424242',
  '#3b3b3b', '#2c2c2c', '#1e1e1e', '#181818', '#121212',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 7,
  colors: { brand, dark },
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  defaultRadius: 'sm',
  cursorType: 'pointer',
});

/** Light / dark / auto, kept under the key used before Mantine ('system' is read as 'auto') */
export const colorSchemeManager = localStorageColorSchemeManager({ key: 'themeMode' });

/** MUI breakpoints the layout was designed with */
export const MOBILE_QUERY = '(max-width: 599.95px)';
export const WIDE_QUERY = '(min-width: 900px)';
