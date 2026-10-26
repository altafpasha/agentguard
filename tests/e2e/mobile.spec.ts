import { test, expect } from '@playwright/test';

test.describe('AgentGuard Mobile Responsiveness & Navigation', () => {
  test('Mobile navigation drawer opens and navigates across all primary flows', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check header renders compactly
    await expect(page.locator('h1')).toContainText('Darlene Robertson');

    // Toggle mobile menu drawer
    const menuBtn = page.locator('button[aria-label="Toggle Navigation Menu"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Verify mobile drawer navigation links
    const drawer = page.locator('nav').last();
    await expect(drawer.getByRole('link', { name: 'Transactions' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Approvals' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Attack Lab' })).toBeVisible();

    // Navigate to Approvals on mobile
    await drawer.getByRole('link', { name: 'Approvals' }).click();
    await expect(page).toHaveURL(/.*approvals/);
    await expect(page.locator('h1')).toContainText('Human Approval Queue');

    // Capture mobile screenshot
    await page.screenshot({ path: 'dashboard-mobile.png', fullPage: true });
  });
});
