import { expect, test } from '@playwright/test';
import { openWithTracks, wavFile } from './helpers';

test.describe('pitch', () => {
  test('transposes by semitones, fine tunes in cents, and is kept with the piece', async ({ page }) => {
    await openWithTracks(page, [wavFile('horns.wav', 10, 440)]);
    const button = page.locator('[data-pitch-button]');
    await expect(button).toHaveText('0');

    await button.click();
    await page.getByRole('button', { name: 'One semitone higher' }).click();
    await page.getByRole('button', { name: 'One semitone higher' }).click();
    await expect(button).toHaveText('+2');

    const cents = page.getByRole('textbox', { name: 'Fine tuning in cents' });
    await cents.fill('-30');
    await cents.press('Enter');
    await expect(button).toHaveText('+2 −30¢');

    // Cents step up to +50 and stop there, the semitones stay as set
    await cents.fill('45');
    await cents.press('Enter');
    await page.getByRole('button', { name: '5 cents higher' }).click();
    await expect(button).toHaveText('+2 +50¢');
    await expect(page.getByRole('button', { name: '5 cents higher' })).toBeDisabled();
    await cents.fill('70');
    await cents.press('Enter');
    await expect(button).toHaveText('+2 +50¢');
    await cents.fill('-30');
    await cents.press('Enter');
    await page.getByRole('button', { name: 'One semitone higher' }).click();
    await expect(button).toHaveText('+3 −30¢');

    // Plays while transposed
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();

    await page.reload();
    await expect(button).toHaveText('+3 −30¢');
    await button.click();
    await page.getByRole('button', { name: 'Original pitch' }).click();
    await expect(button).toHaveText('0');
  });
});
