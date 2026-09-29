import { expect, test, type Page } from '@playwright/test';
import { openWithTracks, pxPerSecond, rulerX, wavFile } from './helpers';

const stems = [wavFile('bass.wav', 60, 110), wavFile('other.wav', 40, 330)];
const GRADUATION_Y = 36;

/** Clip of other.wav: [position, trimmed at start, duration] in seconds */
async function otherClip(page: Page) {
  const clip = page.locator('[data-track-row="other.wav"] [data-clip]');
  const read = async (name: string) => Number(await clip.getAttribute(name));
  return [await read('data-clip-start'), await read('data-clip-trim'), await read('data-clip-duration')].map((v) => Math.round(v * 10) / 10);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, options: { alt?: boolean } = {}) {
  await page.mouse.move(from.x, from.y);
  if (options.alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 8 });
  await page.mouse.up();
  if (options.alt) await page.keyboard.up('Alt');
}

async function clipBox(page: Page) {
  return (await page.locator('[data-track-row="other.wav"] [data-clip]').boundingBox())!;
}

test.describe('clip editing', () => {
  test.beforeEach(async ({ page }) => {
    await openWithTracks(page, stems);
  });

  test('an edge shows a thick border and a horizontal arrow, and trims the clip', async ({ page }) => {
    const pps = await pxPerSecond(page);
    const box = await clipBox(page);
    const lane = page.locator('[data-track-row="other.wav"] [data-clip]').locator('..');

    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
    await expect(lane).toHaveCSS('cursor', 'ew-resize');
    await expect(page.locator('[data-clip-edge="end"]')).toBeVisible();

    await drag(page, { x: box.x + box.width - 2, y: box.y + box.height / 2 }, -10 * pps);
    expect(await otherClip(page)).toEqual([0, 0, 30]);
  });

  test('trimming the start keeps the end in place', async ({ page }) => {
    const pps = await pxPerSecond(page);
    const box = await clipBox(page);
    await drag(page, { x: box.x + 2, y: box.y + box.height / 2 }, 5 * pps);
    expect(await otherClip(page)).toEqual([5, 5, 35]);
  });

  test('the body moves the clip, and it is kept after a reload', async ({ page }) => {
    const pps = await pxPerSecond(page);
    const box = await clipBox(page);
    const lane = page.locator('[data-track-row="other.wav"] [data-clip]').locator('..');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(lane).toHaveCSS('cursor', 'grab');

    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 12 * pps);
    expect(await otherClip(page)).toEqual([12, 0, 40]);

    await page.reload();
    await expect(page.locator('[data-clip]')).toHaveCount(2);
    expect(await otherClip(page)).toEqual([12, 0, 40]);
  });

  test('a clip snaps to a marker, unless Alt is held or the magnet is off', async ({ page }) => {
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.dblclick(await rulerX(page, 20), ruler.y + GRADUATION_Y);
    await expect(page.locator('[data-marker]')).toHaveCount(1);
    const pps = await pxPerSecond(page);

    // Drop the clip start a few pixels before the marker: it sticks to it
    let box = await clipBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20 * pps - 4, box.y + box.height / 2, { steps: 8 });
    await expect(page.locator('[data-snap-guide]')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('[data-snap-guide]')).toHaveCount(0);
    const [snapped] = await otherClip(page);
    expect(snapped).toBeCloseTo(20, 1);

    // Alt: free placement
    box = await clipBox(page);
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -4 * pps + 5, { alt: true });
    const [free] = await otherClip(page);
    expect(free).not.toBe(16);
    expect(Math.abs(free - 16)).toBeLessThan(0.6);

    // Magnet off: no snapping either
    await page.getByRole('button', { name: 'Snapping' }).click();
    await expect(page.getByRole('button', { name: 'Snapping' })).toHaveAttribute('aria-pressed', 'false');
    box = await clipBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + (20 - free) * pps - 4, box.y + box.height / 2, { steps: 8 });
    await expect(page.locator('[data-snap-guide]')).toHaveCount(0);
    await page.mouse.up();
    expect((await otherClip(page))[0]).not.toBe(20);
  });

  test('Ctrl+Z undoes and Ctrl+Shift+Z redoes clip edits', async ({ page }) => {
    const pps = await pxPerSecond(page);
    let box = await clipBox(page);
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 10 * pps, { alt: true });
    box = await clipBox(page);
    await drag(page, { x: box.x + box.width - 2, y: box.y + box.height / 2 }, -5 * pps, { alt: true });
    expect(await otherClip(page)).toEqual([10, 0, 35]);

    await page.keyboard.press('Control+z');
    await expect.poll(() => otherClip(page)).toEqual([10, 0, 40]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => otherClip(page)).toEqual([0, 0, 40]);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => otherClip(page)).toEqual([10, 0, 40]);
  });

  test('a click on a clip without moving just moves the playhead', async ({ page }) => {
    const pps = await pxPerSecond(page);
    const box = await clipBox(page);
    await page.mouse.click(box.x + 15.5 * pps, box.y + box.height / 2);
    await expect(page.getByTestId('current-time')).toHaveText('0:15');
    expect(await otherClip(page)).toEqual([0, 0, 40]);
  });
});
