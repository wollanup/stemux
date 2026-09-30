/**
 * Simple color picker: a few swatches from a palette (no free RGB choice),
 * shown in a popover next to the element that opened it.
 */

import { Box, ButtonBase, Popover, useTheme } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useTranslation } from 'react-i18next';

interface ColorPaletteProps {
  anchorEl: HTMLElement | null;
  colors: string[];
  value: string | undefined;
  onSelect: (color: string) => void;
  onClose: () => void;
}

export default function ColorPalette({ anchorEl, colors, value, onSelect, onClose }: ColorPaletteProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box role="listbox" aria-label={t('colors.title')} sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 32px)', gap: 1, p: 1.5 }}>
        {colors.map((color, index) => {
          const selected = color.toLowerCase() === value?.toLowerCase();
          return (
            <ButtonBase
              key={color}
              role="option"
              aria-selected={selected}
              aria-label={t('colors.color', { number: index + 1 })}
              data-color={color}
              onClick={() => {
                onSelect(color);
                onClose();
              }}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: color,
                color: theme.palette.getContrastText(color),
                outline: selected ? `2px solid ${theme.palette.text.primary}` : 'none',
                outlineOffset: 2,
                transition: 'transform 0.1s',
                '&:hover, &.Mui-focusVisible': { transform: 'scale(1.12)' },
              }}
            >
              {selected && <CheckIcon fontSize="small" />}
              </ButtonBase>
          );
        })}
      </Box>
    </Popover>
  );
}

/** Small round swatch, for menu items */
export function ColorDot({ color }: { color: string }) {
  return <Box component="span" sx={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', bgcolor: color, border: 1, borderColor: 'divider' }} />;
}
