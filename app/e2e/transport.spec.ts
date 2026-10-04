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

test.describe('transport on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('the speed panel stays shown when the visible area moves (browser toolbar, zoom)', async ({ page }) => {
    await openWithTracks(page, [wavFile('horns.wav', 10, 440)]);
    await page.getByRole('button', { name: '1.00x' }).tap();
    const panel = page.getByRole('button', { name: '0.8x' });
    await expect(panel).toBeVisible();

    // The bar leaves the visual viewport, as when the browser toolbar moves or on zoom
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.6 });
    await page.waitForTimeout(300);
    expect(await panel.evaluate((el) => getComputedStyle(el.closest('.mantine-Popover-dropdown')!).display)).not.toBe('none');
  });
});
