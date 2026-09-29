import { expect, type Page } from '@playwright/test';

/** Mono 16-bit WAV: a tone with a click every half second (lightweight fixture) */
export function wavFile(name: string, seconds: number, frequency: number) {
  const sampleRate = 8000;
  const frames = Math.round(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-(t % 0.5) * 12);
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * t) * envelope * 20000), 44 + i * 2);
  }
  return { name, mimeType: 'audio/wav', buffer };
}

/** Fresh app with the given tracks imported */
export async function openWithTracks(page: Page, files: ReturnType<typeof wavFile>[]) {
  await page.addInitScript(() => localStorage.setItem('hasSeenRecordingGuide', 'true'));
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(files);
  await expect(page.locator('[data-track-row]')).toHaveCount(files.length);
  await expect(page.locator('[data-clip]')).toHaveCount(files.length);
}

export async function pxPerSecond(page: Page) {
  return Number(await page.locator('[data-timeline-scroll]').getAttribute('data-px-per-sec'));
}

/** Screen x of a time on the ruler (content not scrolled) */
export async function rulerX(page: Page, seconds: number) {
  const ruler = (await page.getByTestId('time-ruler').boundingBox())!;
  return ruler.x + seconds * (await pxPerSecond(page));
}

/** Playback position as shown in the bottom bar ("m:ss") */
export async function shownTime(page: Page) {
  const text = await page.getByTestId('current-time').textContent();
  const [m, s] = text!.split(':').map(Number);
  return m * 60 + s;
}
