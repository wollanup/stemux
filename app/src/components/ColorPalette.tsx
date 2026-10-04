/**
 * Simple color picker: a few swatches from a palette (no free RGB choice),
 * shown in a popover under the element it wraps (usually the button whose
 * menu opened it).
 */

import type { ReactNode } from 'react';
import { ColorSwatch, Popover, SimpleGrid } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { contrastText } from '../theme/palette';

interface ColorPaletteProps {
  opened: boolean;
  colors: string[];
  value: string | undefined;
  onSelect: (color: string) => void;
  onClose: () => void;
  /** The popover is anchored to it */
  children: ReactNode;
}

export default function ColorPalette({ opened, colors, value, onSelect, onClose, children }: ColorPaletteProps) {
  const { t } = useTranslation();
  return (
    <Popover opened={opened} onDismiss={onClose} position="bottom-start" shadow="md" trapFocus returnFocus>
      <Popover.Target>
        <span style={{ display: 'inline-flex' }}>{children}</span>
      </Popover.Target>
      <Popover.Dropdown>
        <SimpleGrid cols={4} spacing="xs" role="listbox" aria-label={t('colors.title')}>
          {colors.map((color, index) => {
            const selected = color.toLowerCase() === value?.toLowerCase();
            return (
              <ColorSwatch
                key={color}
                component="button"
                color={color}
                size={32}
                role="option"
                aria-selected={selected}
                aria-label={t('colors.color', { number: index + 1 })}
                data-color={color}
                c={contrastText(color)}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  onSelect(color);
                  onClose();
                }}
              >
                {selected && <IconCheck size={18} />}
              </ColorSwatch>
            );
          })}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Small round swatch, for menu items */
export function ColorDot({ color }: { color: string }) {
  return <ColorSwatch color={color} size={16} />;
}
