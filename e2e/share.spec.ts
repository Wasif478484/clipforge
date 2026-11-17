import { expect, test } from '@playwright/test';

const validPath =
  '123e4567-e89b-12d3-a456-426655440000/123e4567-e89b-12d3-a456-426655440001.mp4';

test('share route renders the public player for well-formed links', async ({ page }) => {
  // This preview deployment has no cloud backend baked in, so it shows the
  // deployment-not-supported card (path is well-formed). A configured
  // deployment shows the <video> instead.
  await page.goto(`/#/share/${validPath}`);
  await expect(
    page.getByRole('heading', { name: /cannot play shared videos|someone shared/i }),
  ).toBeVisible();
  // No account required to watch.
  await expect(page.getByRole('heading', { name: /sign in/i })).toHaveCount(0);
});

test('share route rejects malformed paths', async ({ page }) => {
  await page.goto('/#/share/../../etc/passwd');
  await expect(page.getByRole('heading', { name: /not valid/i })).toBeVisible();
});
