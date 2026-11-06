import { expect, test } from '@playwright/test';

test('landing page exposes local-first editor launch', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /open-source video editor|clipforge setup required/i }),
  ).toBeVisible();
  const landing = page.getByRole('heading', { name: /open-source video editor/i });
  if (await landing.isVisible()) {
    await expect(page.getByText(/no uploads, no telemetry/i)).toBeVisible();
  } else {
    await expect(page.getByText(/VITE_SUPABASE_URL/i)).toBeVisible();
  }
});
