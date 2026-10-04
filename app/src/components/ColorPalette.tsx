/**
 * Simple color picker: a few swatches from a palette (no free RGB choice),
 * shown in a popover under the element it wraps (usually the button whose
 * menu opened it).
 */

import type { ReactNode } from 'react';
import { Popover, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { contrastText } from '../theme/palette';
import classes from './ColorPalette.module.css';

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
        <span className={classes.anchor}>{children}</span>
      </Popover.Target>
      <Popover.Dropdown p="sm">
        <div role="listbox" aria-label={t('colors.title')} className={classes.grid}>
          {colors.map((color, index) => {
            const selected = color.toLowerCase() === value?.toLowerCase();
            return (
              <UnstyledButton
                key={color}
                role="option"
                aria-selected={selected}
                aria-label={t('colors.color', { number: index + 1 })}
                data-color={color}
                data-selected={selected || undefined}
                className={classes.swatch}
                style={{ backgroundColor: color, color: contrastText(color) }}
                onClick={() => {
                  onSelect(color);
                  onClose();
                }}
              >
                {selected && <IconCheck size={18} />}
              </UnstyledButton>
            );
          })}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Small round swatch, for menu items */
export function ColorDot({ color }: { color: string }) {
  return <span className={classes.dot} style={{ backgroundColor: color }} />;
}
