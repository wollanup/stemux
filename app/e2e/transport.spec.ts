import { expect, test } from '@playwright/test';
import { openWithTracks, shownTime, wavFile } from './helpers';

test.describe('transport', () => {
  test('the speed button opens its panel and a preset sets the speed', async ({ page }) => {
    await openWithTracks(page, [wavFile('horns.wav', 10, 440)]);
    await page.getByRole('button', { name: '1.00x' }).click();
    await page.getByRole('button', { name: '0.8x' }).click();
    await expect(page.getByRole('button', { name: '0.80x' })).toBeVisible();
  });

  test('Home goes back to the start', async ({ page }) => {
    await openWithTracks(page, [wavFile('horns.wav', 30, 440)]);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => shownTime(page)).toBe(5);
    await page.keyboard.press('Home');
    await expect.poll(() => shownTime(page)).toBe(0);
  });
});
