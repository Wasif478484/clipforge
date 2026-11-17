import { expect, test } from '@playwright/test';

test('MP4 export runs the offline WebCodecs path and downloads a playable file', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.getByRole('button', { name: /open the studio/i }).first().click();
  // AuthGate (configured Supabase deployments) shows a login gate first.
  const localMode = page.getByRole('button', { name: /continue without an account/i });
  if (await localMode.isVisible().catch(() => false)) await localMode.click();

  // ~6 s sample clip, then put it on the timeline.
  await page.getByRole('button', { name: /sample video/i }).click();
  const add = page.getByRole('button', { name: /add .* to timeline/i }).first();
  await expect(add).toBeVisible({ timeout: 60_000 });
  await add.click();

  // Choose MP4 and start.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Format').selectOption('mp4');
  await page.getByRole('button', { name: 'Start export' }).click();

  // The offline path announces itself; the recorder+ffmpeg fallback would not.
  await expect(page.getByText(/rendering mp4 as fast/i)).toBeVisible({ timeout: 20_000 });

  const download = await page.waitForEvent('download', { timeout: 240_000 });
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);

  // Basic container sanity: MP4 files start with the ftyp box.
  const stream = await download.createReadStream();
  const head: Buffer = await new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    stream.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 12) { stream.destroy(); resolve(buf); }
    });
    stream.on('end', () => resolve(buf));
    stream.on('error', reject);
  });
  expect(head.subarray(4, 8).toString('ascii')).toBe('ftyp');
});
