import { expect, test } from '@playwright/test';
import { openWithTracks, pxPerSecond, rulerX, shownTime, wavFile } from './helpers';

const RULER_STRIP_Y = 12; // inside the loop strip
const RULER_GRADUATION_Y = 36; // inside the graduation

const stems = [wavFile('bass.wav', 60, 110), wavFile('drums.wav', 60, 220), wavFile('other.wav', 45, 330)];

test.describe('timeline', () => {
  test('shows one ruler and one lane per track, clips at the start of the piece', async ({ page }) => {
    await openWithTracks(page, stems);

    await expect(page.getByTestId('time-ruler')).toHaveCount(1);
    const starts = await page.locator('[data-clip]').evaluateAll((clips) => clips.map((c) => Number(c.getAttribute('data-clip-start'))));
    expect(starts).toEqual([0, 0, 0]);
    // Every track shares the same scale: a 45s clip is 3/4 of a 60s one
    const widths = await page.locator('[data-clip]').evaluateAll((clips) => clips.map((c) => c.getBoundingClientRect().width));
    expect(widths[2] / widths[0]).toBeCloseTo(0.75, 2);
  });

  test('a click on the graduation moves the playhead, a click in the loop strip adds a marker', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;

    await page.mouse.click(await rulerX(page, 20.5), ruler.y + RULER_GRADUATION_Y);
    await expect.poll(() => shownTime(page)).toBe(20);

    await page.mouse.click(await rulerX(page, 40.5), ruler.y + RULER_STRIP_Y);
    await expect(page.locator('[data-marker]')).toHaveCount(1);
    expect(await shownTime(page)).toBe(20);

    // A double click on the graduation is just two seeks now (the markers list moved the ruler down)
    const rulerNow = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.dblclick(await rulerX(page, 30.5), rulerNow.y + RULER_GRADUATION_Y);
    await expect.poll(() => shownTime(page)).toBe(30);
    await expect(page.locator('[data-marker]')).toHaveCount(1);
  });

  test('pressing on the graduation places the playhead, dragging moves it precisely', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;

    await page.mouse.move(await rulerX(page, 10.5), ruler.y + RULER_GRADUATION_Y);
    await page.mouse.down();
    await expect.poll(() => shownTime(page)).toBe(10);
    await page.mouse.move(await rulerX(page, 25.5), ruler.y + RULER_GRADUATION_Y, { steps: 8 });
    await expect.poll(() => shownTime(page)).toBe(25);
    await page.mouse.up();

    // Only the playhead moved: no loop created
    await expect.poll(() => shownTime(page)).toBe(25);
    await expect(page.locator('[data-marker]')).toHaveCount(0);
  });

  test('dragging in the loop strip creates an active loop, with handles inside the strip', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;

    await page.mouse.move(await rulerX(page, 10), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    // Two markers and an active loop in the list above the timeline
    await expect(page.getByText('Markers:')).toBeVisible();
    await expect(page.locator('[data-marker]')).toHaveCount(2);
    await expect(page.getByText('1 → 2')).toBeVisible();

    // Handles stay in the loop strip (they do not cover the graduation).
    // The markers list appeared above the timeline: measure the ruler again.
    const rulerNow = (await page.getByTestId('time-ruler').boundingBox())!;
    for (const marker of await page.locator('[data-marker] > div').all()) {
      const box = (await marker.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(rulerNow.y);
      expect(box.y + box.height).toBeLessThanOrEqual(rulerNow.y + 24);
    }
  });

  test('Ctrl+Z undoes a new loop at once (its two markers too), Ctrl+Shift+Z brings it back', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;

    await page.mouse.move(await rulerX(page, 10), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-marker]')).toHaveCount(2);

    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-marker]')).toHaveCount(0);
    await expect(page.locator('[data-loop]')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-marker]')).toHaveCount(2);
    await expect(page.locator('[data-loop]')).toHaveCount(1);
  });

  test('the × of a chip deletes the loop or the marker at once, Ctrl+Z brings it back', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 10), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    await page.locator('[data-loop-chip]').getByRole('button', { name: 'Delete loop' }).click();
    await expect(page.locator('[data-loop]')).toHaveCount(0);
    await expect(page.locator('[data-marker]')).toHaveCount(2);

    await page.locator('[data-marker-chip]').first().getByRole('button', { name: 'Delete marker' }).click();
    await expect(page.locator('[data-marker]')).toHaveCount(1);

    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-marker]')).toHaveCount(2);
    await expect(page.locator('[data-loop]')).toHaveCount(1);
  });

  test('a loop and a track get a color picked from a palette in their ⋮ menu', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 10), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    await page.locator('[data-loop-chip]').getByRole('button', { name: 'Loop options' }).click();
    await page.getByRole('menuitem', { name: 'Color' }).click();
    await page.getByRole('option', { name: 'Color 3' }).click();
    // The loop in the ruler takes it (#EC407A)
    await expect(page.locator('[data-loop]')).toHaveCSS('border-top-color', 'rgb(236, 64, 122)');

    const row = page.locator('[data-track-row="bass.wav"]');
    await row.getByRole('button', { name: 'Track options' }).click();
    await page.getByRole('menuitem', { name: 'Color' }).click();
    await page.getByRole('option', { name: 'Color 6' }).click();
    // Colored stripe of the header (#FF6B6B)
    await expect(row.locator('[data-track-header]')).toHaveCSS('border-left-color', 'rgb(255, 107, 107)');

    await row.getByRole('button', { name: 'Track options' }).click();
    await page.getByRole('menuitem', { name: 'Delete track' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('[data-track-row]')).toHaveCount(2);
  });

  test('the mouse wheel over a volume slider changes the volume', async ({ page }) => {
    await openWithTracks(page, stems);
    const slider = page.locator('[data-track-row="bass.wav"] .MuiSlider-root');
    const volume = () => slider.locator('input').inputValue().then(Number);
    const before = await volume();
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 200); // down: 4 steps of 2%
    await expect.poll(volume).toBe(before - 8);
    await page.mouse.wheel(0, -100);
    await expect.poll(volume).toBe(before - 4);
  });

  test('by default, dragging a lane scrolls the timeline without moving clips nor the playhead', async ({ page }) => {
    await openWithTracks(page, stems);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const scroller = page.locator('[data-timeline-scroll]');
    await scroller.evaluate((el) => (el.scrollLeft = 0));
    const lane = page.locator('[data-track-row="bass.wav"] [data-clip]').locator('..');
    await page.mouse.move(700, 200);
    await expect(lane).toHaveCSS('cursor', 'grab');

    const box = (await lane.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(900, y);
    await page.mouse.down();
    await page.mouse.move(600, y, { steps: 8 });
    await page.mouse.up();

    expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(250);
    expect(await page.locator('[data-track-row="bass.wav"] [data-clip]').getAttribute('data-clip-start')).toBe('0');
    expect(await shownTime(page)).toBe(0);
  });

  test('double clicking a loop enables it and plays it from its start', async ({ page }) => {
    await openWithTracks(page, stems);
    let ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 30), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-marker]')).toHaveCount(2);

    // Move away: seeking outside the loop disables it
    ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.click(await rulerX(page, 45.5), ruler.y + RULER_GRADUATION_Y);
    await expect.poll(() => shownTime(page)).toBe(45);

    // A single click on the loop does nothing (no marker inside a loop)
    await page.mouse.click(await rulerX(page, 25), ruler.y + RULER_STRIP_Y);
    await page.waitForTimeout(400);
    expect(await shownTime(page)).toBe(45);
    await expect(page.locator('[data-marker]')).toHaveCount(2);

    await page.mouse.dblclick(await rulerX(page, 25), ruler.y + RULER_STRIP_Y);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    // Plays inside the loop, from its start
    await expect.poll(() => shownTime(page)).toBeGreaterThanOrEqual(20);
    expect(await shownTime(page)).toBeLessThanOrEqual(22);
  });

  test('a loop chip plays the loop, and pauses it on a second click', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 30), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    await page.getByRole('button', { name: 'Play the loop' }).click();
    await expect(page.getByRole('button', { name: 'Pause the loop' })).toBeVisible();
    await expect.poll(() => shownTime(page)).toBeGreaterThanOrEqual(20);

    await page.getByRole('button', { name: 'Pause the loop' }).click();
    await expect(page.getByRole('button', { name: 'Play the loop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('"continue past the loop" keeps playing beyond the loop end', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 22), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    // Only offered while the loop plays
    const chip = page.getByRole('button', { name: 'Play the loop' });
    await chip.getByRole('button', { name: 'Loop options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Continue past the loop' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await chip.click();
    await page.getByRole('button', { name: 'Pause the loop' }).getByRole('button', { name: 'Loop options' }).click();
    await page.getByRole('menuitem', { name: 'Continue past the loop' }).click();

    await expect.poll(() => shownTime(page), { timeout: 8000 }).toBeGreaterThanOrEqual(23);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  });

  test('dragging a loop moves it, without adding markers', async ({ page }) => {
    await openWithTracks(page, stems);
    let ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 10), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-marker]')).toHaveCount(2);

    ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 15), ruler.y + RULER_STRIP_Y);
    await expect(page.getByTestId('time-ruler')).toHaveCSS('cursor', 'grab');
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 25), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    await expect(page.locator('[data-marker]')).toHaveCount(2);
    await expect(page.locator('[data-loop]')).toHaveCount(1);
    await expect(page.getByText(/^1 - 0:(19|20)$/)).toBeVisible();
    await expect(page.getByText(/^2 - 0:(29|30)$/)).toBeVisible();
  });

  test('the marker line across the tracks follows a handle while it is dragged', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.click(await rulerX(page, 30), ruler.y + RULER_STRIP_Y);
    await expect(page.locator('[data-marker]')).toHaveCount(1);

    const handle = (await page.locator('[data-marker] > div').first().boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    const target = await rulerX(page, 40);
    await page.mouse.move(target, handle.y + handle.height / 2, { steps: 5 });

    // Button still down: the line over the tracks is already there
    const line = page.locator('[data-marker-line]');
    await expect.poll(async () => (await line.boundingBox())!.x).toBeGreaterThan(target - 3);
    expect((await line.boundingBox())!.x).toBeLessThan(target + 3);
    await page.mouse.up();
  });

  test('"loop on entry" enables the loop when the playhead gets in it', async ({ page }) => {
    await openWithTracks(page, stems);
    let ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.move(await rulerX(page, 20), ruler.y + RULER_STRIP_Y);
    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 22), ruler.y + RULER_STRIP_Y, { steps: 5 });
    await page.mouse.up();

    // Seeking before the loop disables it
    ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.click(await rulerX(page, 18.5), ruler.y + RULER_GRADUATION_Y);
    await expect.poll(() => shownTime(page)).toBe(18);

    await page.getByRole('button', { name: 'Play the loop' }).getByRole('button', { name: 'Loop options' }).click();
    await page.getByRole('menuitem', { name: 'Loop on entry' }).click();
    await expect(page.locator('[data-loop][data-armed]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause the loop' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loop][data-armed]')).toHaveCount(0);
    // It loops: the playhead does not go past its end
    await page.waitForTimeout(2500);
    expect(await shownTime(page)).toBeLessThanOrEqual(22);
    expect(await shownTime(page)).toBeGreaterThanOrEqual(20);
  });

  test('a marker handle shows a horizontal arrow and can be dragged', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.click(await rulerX(page, 30), ruler.y + RULER_STRIP_Y);
    await expect(page.locator('[data-marker]')).toHaveCount(1);

    const handle = page.locator('[data-marker] > div').first();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('time-ruler')).toHaveCSS('cursor', 'ew-resize');

    await page.mouse.down();
    await page.mouse.move(await rulerX(page, 40), box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByText(/^1 - 0:(39|40)$/)).toBeVisible();
  });

  test('the header column and track heights can be resized and are remembered', async ({ page }) => {
    await openWithTracks(page, stems);

    const columnHandle = page.getByRole('separator', { name: /change the width/ }).first();
    const column = (await columnHandle.boundingBox())!;
    await page.mouse.move(column.x + column.width / 2, column.y + 10);
    await page.mouse.down();
    await page.mouse.move(column.x + column.width / 2 + 60, column.y + 10, { steps: 4 });
    await page.mouse.up();

    const row = page.locator('[data-track-row="bass.wav"]');
    const heightHandle = row.getByRole('separator', { name: /change the height/ });
    const edge = (await heightHandle.boundingBox())!;
    await page.mouse.move(edge.x + 400, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + 400, edge.y + edge.height / 2 + 100, { steps: 4 });
    await page.mouse.up();
    await expect(row).toHaveAttribute('data-track-height', '180');

    await page.reload();
    await expect(page.locator('[data-track-row="bass.wav"]')).toHaveAttribute('data-track-height', '180');
    expect(await page.evaluate(() => localStorage.getItem('timeline-header-width'))).toBe('360');
  });

  test('zooming keeps a single scale for every track', async ({ page }) => {
    await openWithTracks(page, stems);
    const fit = await pxPerSecond(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(() => pxPerSecond(page)).toBeGreaterThan(fit);
    const zoomed = await pxPerSecond(page);
    const width = (await page.locator('[data-clip]').first().boundingBox())!.width;
    expect(width).toBeCloseTo(60 * zoomed, 0);
  });
});

test.describe('recording', () => {
  test('a take started at 0:30 becomes a clip at 0:30 on the timeline', async ({ page }) => {
    await openWithTracks(page, stems);
    const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
    await page.mouse.click(await rulerX(page, 30.2), ruler.y + RULER_GRADUATION_Y);
    await expect.poll(() => shownTime(page)).toBe(30);

    await page.getByRole('button', { name: 'Add recording track' }).click();
    await expect(page.locator('[data-track-row]')).toHaveCount(4);
    await page.getByRole('button', { name: 'Arm for recording' }).click();
    await expect(page.getByRole('button', { name: 'Arm for recording' })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Space');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Space');

    // The take is a clip placed where recording started (minus latency compensation)
    await expect(page.locator('[data-clip]')).toHaveCount(4);
    const take = page.locator('[data-clip]').nth(3);
    const start = Number(await take.getAttribute('data-clip-start'));
    const duration = Number(await take.getAttribute('data-clip-duration'));
    expect(start).toBeGreaterThan(29.5);
    expect(start).toBeLessThanOrEqual(30.2);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(3);

    // Still there after a reload
    await page.reload();
    await expect(page.locator('[data-clip]')).toHaveCount(4);
    expect(Number(await page.locator('[data-clip]').nth(3).getAttribute('data-clip-start'))).toBeCloseTo(start, 3);
  });
});
