import { test } from '@playwright/test';

const pages = [
  { name: 'overview', url: '/' },
  { name: 'transactions', url: '/transactions' },
  { name: 'approvals', url: '/approvals' },
  { name: 'policies', url: '/policies' },
  { name: 'audit', url: '/audit' },
  { name: 'attack-lab', url: '/attack-lab' },
  { name: 'settings', url: '/settings' },
];

const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

for (const vp of viewports) {
  test.describe(`Viewport: ${vp.name}`, () => {
    for (const p of pages) {
      test(`capture ${p.name} on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(p.url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `responsive-${p.name}-${vp.name}.png`,
          fullPage: true,
        });
      });
    }
  });
}
