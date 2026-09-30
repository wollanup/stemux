import { expect, test } from '@playwright/test';
import { openWithTracks, pxPerSecond, rulerX, wavFile } from './helpers';

// The fixtures click every half second: 120 BPM
const stems = [wavFile('bass.wav', 30, 110), wavFile('drums.wav', 30, 220)];

test.describe('tempo', () => {
  test('detects the tempo, counts bars on the ruler, and is kept with the piece', async ({ page }) => {
    await openWithTracks(page, stems);
    await expect(page.locator('canvas[data-graduation]')).toHaveAttribute('data-graduation', 'time');

    await page.getByRole('button', { name: 'Tempo' }).click();
    await page.getByRole('button', { name: 'Detect' }).click();
    await expect(page.locator('[data-tempo-message]')).toHaveText(/Detected: 120 BPM/);
    await expect(page.getByRole('textbox', { name: 'Tempo in beats per minute' })).toHaveValue('120');
    // Bar 1 on the first click
    await expect(page.locator('[data-tempo-offset]')).toHaveText('0:00.00');

    // The ruler switched to bars, with lines across the tracks, and the position is shown as bar.beat
    await expect(page.locator('canvas[data-graduation]')).toHaveAttribute('data-graduation', 'bars');
    await expect(page.locator('canvas[data-grid-lines]')).toHaveCount(1);
    await expect(page.getByTestId('current-bar')).toHaveText('1.1');

    // Typed tempo and signature
    const bpm = page.getByRole('textbox', { name: 'Tempo in beats per minute' });
    await bpm.fill('90');
    await bpm.press('Enter');
    await page.getByRole('combobox', { name: 'Beats per bar' }).click();
    await page.getByRole('option', { name: '3', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-tempo-button]')).toHaveText('90 BPM');

    await page.reload();
    await expect(page.locator('[data-tempo-button]')).toHaveText('90 BPM');
    await page.locator('[data-tempo-button]').click();
    await expect(page.getByRole('combobox', { name: 'Beats per bar' })).toHaveText('3');
    await page.getByRole('button', { name: 'Time', exact: true }).click();
    await expect(page.locator('canvas[data-graduation]')).toHaveAttribute('data-graduation', 'time');
  });

  test('tap tempo follows the taps', async ({ page }) => {
    await openWithTracks(page, stems);
    await page.getByRole('button', { name: 'Tempo' }).click();
    // Taps every 400ms, timed in the page: 150 BPM
    await page.getByRole('button', { name: /^Tap/ }).evaluate(async (button: HTMLElement) => {
      for (let i = 0; i < 5; i++) {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    });
    await expect(page.getByRole('button', { name: /^Tap/ })).toHaveText(/\(5\)/);
    const value = Number(await page.getByRole('textbox', { name: 'Tempo in beats per minute' }).inputValue());
    expect(value).toBeGreaterThan(145);
    expect(value).toBeLessThan(155);
  });

  test('in bars mode, new markers stick to the beats (not with Alt)', async ({ page }) => {
    await openWithTracks(page, stems);
    await page.getByRole('button', { name: 'Tempo' }).click();
    await page.getByRole('button', { name: 'Detect' }).click();
    await expect(page.locator('[data-tempo-message]')).toHaveText(/120 BPM/);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-tempo-panel]')).toHaveCount(0);

    const markerTimes = async () =>
      (await page.locator('[data-marker]').evaluateAll((flags) => flags.map((f) => Number(f.getAttribute('data-time')))))
        .map((t) => Math.round(t * 100) / 100)
        .sort((a, b) => a - b);

    // 5px after the beat at 10s: sticks to it
    let ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    const pps = await pxPerSecond(page);
    await page.mouse.click((await rulerX(page, 10)) + 5, ruler.y + 12);
    await expect.poll(markerTimes).toEqual([10]);

    // With Alt, it stays where it was clicked
    ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.keyboard.down('Alt');
    await page.mouse.click((await rulerX(page, 20)) + 5, ruler.y + 12);
    await page.keyboard.up('Alt');
    await expect.poll(markerTimes).toEqual([10, Math.round((20 + 5 / pps) * 100) / 100]);
  });
});
