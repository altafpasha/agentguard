import { test } from '@playwright/test';

test('Capture mobile showcase screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  // 1. Mobile Menu Open
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const menuToggle = page.locator('#mobile-nav-toggle');
  await menuToggle.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'mobile-nav-open.png' });

  // 2. Mobile Storefront
  await page.goto('/storefront', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'mobile-storefront.png' });

  // 3. Mobile Pricing
  await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'mobile-pricing.png' });
});
