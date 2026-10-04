import { createTheme, localStorageColorSchemeManager } from '@mantine/core';

/** Mantine defaults: no override of colors, fonts or sizes */
export const theme = createTheme({});

/** Light / dark / auto, kept under the key used before Mantine ('system' is read as 'auto') */
export const colorSchemeManager = localStorageColorSchemeManager({ key: 'themeMode' });
