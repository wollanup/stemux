import { expect, test } from '@playwright/test';
import { openWithTracks, wavFile } from './helpers';

test.describe('pan', () => {
  test('pans a track, keeps it with the piece, and a double click centers it', async ({ page }) => {
    await openWithTracks(page, [wavFile('horns.wav', 10, 440)]);
    const slider = page.locator('[data-pan-slider]');
    const thumb = slider.getByRole('slider', { name: 'Pan' });
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');

    // Click near the left end
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
    const left = Number(await thumb.getAttribute('aria-valuenow'));
    expect(left).toBeLessThan(-50);

    await page.reload();
    await expect(page.locator('[data-pan-slider]').getByRole('slider', { name: 'Pan' })).toHaveAttribute('aria-valuenow', String(left));

    const again = (await page.locator('[data-pan-slider]').boundingBox())!;
    await page.mouse.dblclick(again.x + again.width * 0.75, again.y + again.height / 2);
    await expect(page.locator('[data-pan-slider]').getByRole('slider', { name: 'Pan' })).toHaveAttribute('aria-valuenow', '0');
  });
});

test.describe('pan on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('a button shows the pan and opens a panel with steps and a center button', async ({ page }) => {
    await openWithTracks(page, [wavFile('horns.wav', 10, 440)]);
    const button = page.locator('[data-pan-button]');
    await expect(button).toHaveText('C');
    await expect(page.locator('[data-pan-slider]')).toHaveCount(0);

    await button.tap();
    await page.getByRole('button', { name: 'To the right' }).tap();
    await page.getByRole('button', { name: 'To the right' }).tap();
    await expect(button).toHaveText('R 10');

    await page.getByRole('button', { name: 'Center' }).tap();
    await expect(button).toHaveText('C');
  });
});
