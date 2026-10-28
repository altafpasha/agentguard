import { test, expect } from '@playwright/test';

test.describe('Dashboard Cards Sizing and Alignment Verification', () => {
  test.beforeEach(async ({ context, page }) => {
    // Provide authenticated session token for altaf (OWNER)
    const token = 'agentguard_test_session_token_12345';
    await context.addCookies([
      {
        name: 'agentguard_session',
        value: token,
        url: 'http://127.0.0.1:3000',
      },
      {
        name: 'agentguard_session',
        value: token,
        url: 'http://localhost:3000',
      },
    ]);
    await page.addInitScript((reviewerToken) => {
      (globalThis as any).localStorage.setItem('agentguard_reviewer_token', reviewerToken);
    }, token);
  });

  test('1. Desktop: Evaluation Activity, Threat Breakdown, and Live Security Interceptions cards have identical dimensions and alignment', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Desktop 3-column test');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Locate the 3 outer cards
    const card1 = page.locator('h3:has-text("Evaluation Activity")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const card2 = page.locator('h3:has-text("Threat Breakdown")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const card3 = page.locator('h3:has-text("Live Security Interceptions")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');

    await expect(card1).toBeVisible({ timeout: 15000 });
    await expect(card2).toBeVisible({ timeout: 15000 });
    await expect(card3).toBeVisible({ timeout: 15000 });

    // Allow CSS transition on navigation sidebar to settle
    await page.waitForTimeout(500);

    const box1 = await card1.boundingBox();
    const box2 = await card2.boundingBox();
    const box3 = await card3.boundingBox();

    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(box3).not.toBeNull();

    if (box1 && box2 && box3) {
      console.log(`Card 1 (Activity): w=${box1.width.toFixed(1)}, h=${box1.height.toFixed(1)}, y=${box1.y.toFixed(1)}`);
      console.log(`Card 2 (Threat):   w=${box2.width.toFixed(1)}, h=${box2.height.toFixed(1)}, y=${box2.y.toFixed(1)}`);
      console.log(`Card 3 (Feed):     w=${box3.width.toFixed(1)}, h=${box3.height.toFixed(1)}, y=${box3.y.toFixed(1)}`);

      // 1. Equal Heights (within 1.5px float precision)
      expect(Math.abs(box1.height - box2.height)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box2.height - box3.height)).toBeLessThanOrEqual(1.5);

      // 2. Equal Widths in 3-column desktop grid
      expect(Math.abs(box1.width - box2.width)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box2.width - box3.width)).toBeLessThanOrEqual(1.5);

      // 3. Top edge alignment (within 1.5px float precision)
      expect(Math.abs(box1.y - box2.y)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box2.y - box3.y)).toBeLessThanOrEqual(1.5);

      // 4. Bottom edge alignment (within 1.5px float precision)
      const bottom1 = box1.y + box1.height;
      const bottom2 = box2.y + box2.height;
      const bottom3 = box3.y + box3.height;
      expect(Math.abs(bottom1 - bottom2)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(bottom2 - bottom3)).toBeLessThanOrEqual(1.5);
    }

    // Save visual evidence
    await page.screenshot({ path: 'dashboard-cards-desktop.png', fullPage: false });
  });

  test('2. Tablet: Evaluation Activity and Threat Breakdown have equal dimensions in row 1, Live Feed spans row 2', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const card1 = page.locator('h3:has-text("Evaluation Activity")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const card2 = page.locator('h3:has-text("Threat Breakdown")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const card3 = page.locator('h3:has-text("Live Security Interceptions")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');

    await expect(card1).toBeVisible({ timeout: 15000 });
    await expect(card2).toBeVisible({ timeout: 15000 });
    await expect(card3).toBeVisible({ timeout: 15000 });

    const box1 = await card1.boundingBox();
    const box2 = await card2.boundingBox();
    const box3 = await card3.boundingBox();

    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(box3).not.toBeNull();

    if (box1 && box2 && box3) {
      console.log(`Tablet Card 1 (Activity): w=${box1.width.toFixed(1)}, h=${box1.height.toFixed(1)}, y=${box1.y.toFixed(1)}`);
      console.log(`Tablet Card 2 (Threat):   w=${box2.width.toFixed(1)}, h=${box2.height.toFixed(1)}, y=${box2.y.toFixed(1)}`);
      console.log(`Tablet Card 3 (Feed):     w=${box3.width.toFixed(1)}, h=${box3.height.toFixed(1)}, y=${box3.y.toFixed(1)}`);

      // Row 1 cards have equal heights and widths
      expect(Math.abs(box1.height - box2.height)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box1.width - box2.width)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(box1.y - box2.y)).toBeLessThanOrEqual(1.5);

      // Row 2 card sits below row 1
      expect(box3.y).toBeGreaterThanOrEqual(box1.y + box1.height - 2);
    }

    await page.screenshot({ path: 'dashboard-cards-tablet.png', fullPage: false });
  });

  test('3. Mobile: Cards stack vertically with no horizontal overflow and consistent padding', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const card1 = page.locator('h3:has-text("Evaluation Activity")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const card2 = page.locator('h3:has-text("Threat Breakdown")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    const card3 = page.locator('h3:has-text("Live Security Interceptions")').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');

    await expect(card1).toBeVisible({ timeout: 15000 });
    await expect(card2).toBeVisible({ timeout: 15000 });
    await expect(card3).toBeVisible({ timeout: 15000 });

    const box1 = await card1.boundingBox();
    const box2 = await card2.boundingBox();
    const box3 = await card3.boundingBox();

    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(box3).not.toBeNull();

    if (box1 && box2 && box3) {
      // Cards stack: y3 > y2 > y1
      expect(box2.y).toBeGreaterThan(box1.y + box1.height - 2);
      expect(box3.y).toBeGreaterThan(box2.y + box2.height - 2);
    }

    // Check no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      return doc.documentElement.scrollWidth > doc.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({ path: 'dashboard-cards-mobile.png', fullPage: false });
  });

  test('4. Docs and Integrations cards have equal outer height, width, and aligned edges', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Desktop/Tablet 2-column test: mobile stacks vertically');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const integrationsCard = page.locator('#dashboard-integrations-card');
    const docsCard = page.locator('#dashboard-docs-card');

    await expect(integrationsCard).toBeVisible({ timeout: 15000 });
    await expect(docsCard).toBeVisible({ timeout: 15000 });

    // Allow CSS transition on navigation sidebar to settle
    await page.waitForTimeout(500);

    const boxInt = await integrationsCard.boundingBox();
    const boxDocs = await docsCard.boundingBox();

    expect(boxInt).not.toBeNull();
    expect(boxDocs).not.toBeNull();

    if (boxInt && boxDocs) {
      console.log(`Docs/Integrations: Integrations h=${boxInt.height.toFixed(1)}, Docs h=${boxDocs.height.toFixed(1)}`);
      // 1. Equal heights within 1.5px
      expect(Math.abs(boxInt.height - boxDocs.height)).toBeLessThanOrEqual(1.5);

      // 2. Equal widths within 1.5px
      expect(Math.abs(boxInt.width - boxDocs.width)).toBeLessThanOrEqual(1.5);

      // 3. Top edge alignment within 1.5px
      expect(Math.abs(boxInt.y - boxDocs.y)).toBeLessThanOrEqual(1.5);

      // 4. Bottom edge alignment within 1.5px
      const bottomInt = boxInt.y + boxInt.height;
      const bottomDocs = boxDocs.y + boxDocs.height;
      expect(Math.abs(bottomInt - bottomDocs)).toBeLessThanOrEqual(1.5);
    }
  });

  test('5. Public Landing Page at / and Documentation Page at /docs load with rich headers and navigation', async ({ page, isMobile }) => {
    // 1. Test Landing Page
    if (!isMobile) {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.goto('/?view=landing', { waitUntil: 'domcontentloaded' });

    const headline = page.locator('h1');
    await expect(headline).toContainText('Give Every AI Agent a Security Guard');

    const getStartedBtn = page.locator('#hero-primary-cta');
    const exploreDocsBtn = page.locator('#hero-secondary-cta');
    await expect(getStartedBtn).toBeVisible({ timeout: 10000 });
    await expect(exploreDocsBtn).toBeVisible({ timeout: 10000 });
    if (!isMobile) {
      await page.screenshot({ path: 'landing-page-desktop.png', fullPage: false });
    }

    // 2. Test Documentation Page
    await page.goto('/docs', { waitUntil: 'domcontentloaded' });
    const docsTitle = page.locator('h1');
    await expect(docsTitle).toContainText('Introduction');

    if (!isMobile) {
      // Sidebar navigation visible on desktop
      const tocSidebar = page.locator('#docs-sidebar');
      await expect(tocSidebar).toBeVisible({ timeout: 10000 });
      await page.screenshot({ path: 'docs-page-desktop.png', fullPage: false });
    } else {
      // Mobile drawer toggle is present
      const mobileBtn = page.locator('button[aria-label="Toggle Documentation Navigation"]');
      await expect(mobileBtn).toBeVisible({ timeout: 10000 });
    }
  });
});
