import type { PopoverProps } from '@mantine/core';

/**
 * Popovers opened from the bottom bar. The bar is fixed at the bottom of the
 * screen: positioned as fixed too, and never hidden as "detached" — on
 * phones the browser toolbar moving under the bar made the panel blink
 * between shown and hidden.
 */
export const BOTTOM_BAR_POPOVER = {
  floatingStrategy: 'fixed',
  hideDetached: false,
} as const satisfies Partial<PopoverProps>;
