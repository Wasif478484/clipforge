import { expect, test } from '@playwright/test';

test('landing page exposes local-first editor launch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open-source video editor/i })).toBeVisible();
  await expect(page.getByText(/no uploads, no telemetry/i)).toBeVisible();
});
