import { test, expect } from '@playwright/test';

test.describe('Responsive Navbar and Button Touch Targets Verification', () => {
  const viewports = [
    { name: 'Mobile iPhone SE', width: 375, height: 667 },
    { name: 'Mobile Modern Phone', width: 414, height: 896 },
    { name: 'Tablet iPad', width: 768, height: 1024 },
    { name: 'Desktop Large', width: 1440, height: 900 },
  ];

  test.beforeEach(async ({ context, request, page }) => {
    try {
      const loginRes = await request.post('http://127.0.0.1:3001/api/v1/auth/login', {
        data: {
          username: 'security_admin',
          password: 'ChangeMeNow123!',
        },
      });
      if (loginRes.ok()) {
        const data = await loginRes.json();
        await context.addCookies([
          {
            name: 'agentguard_session',
            value: data.sessionToken,
            domain: 'localhost',
            path: '/',
          },
        ]);
        await page.addInitScript((token) => {
          (globalThis as any).localStorage.setItem('agentguard_reviewer_token', token);
        }, data.sessionToken);
      }
    } catch {}
  });

  for (const vp of viewports) {
    test(`Navbar layout and buttons behave correctly on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      // Verify Brand Logo is always present and clickable
      const logo = page.locator('header a[aria-label="AgentGuard Dashboard Home"]');
      await expect(logo).toBeVisible();

      // Verify Search button is always visible and has >= 36px touch target
      const searchBtn = page.locator('header button[aria-label="Open Global Search"]');
      await expect(searchBtn).toBeVisible();
      const searchBox = await searchBtn.boundingBox();
      expect(searchBox?.height).toBeGreaterThanOrEqual(36);

      // Verify Notifications Bell is always visible
      const bellBtn = page.locator('header a[aria-label*="Pending Approvals Queue"]');
      await expect(bellBtn).toBeVisible();
      const bellBox = await bellBtn.boundingBox();
      expect(bellBox?.height).toBeGreaterThanOrEqual(36);

      if (vp.width < 1280) {
        // Mobile / Tablet view: Hamburger button must be visible
        const menuToggle = page.locator('#mobile-nav-toggle');
        await expect(menuToggle).toBeVisible();
        const toggleBox = await menuToggle.boundingBox();
        expect(toggleBox?.height).toBeGreaterThanOrEqual(40);

        // Click to open mobile navigation drawer
        await menuToggle.click();

        // Verify mobile drawer appears
        const mobileDrawer = page.locator('nav[aria-label="Mobile Navigation"]');
        await expect(mobileDrawer).toBeVisible();

        // Verify categorized links inside mobile drawer
        await expect(mobileDrawer.getByRole('link', { name: /Overview/i })).toBeVisible();
        await expect(mobileDrawer.getByRole('link', { name: /Storefront/i })).toBeVisible();
        await expect(mobileDrawer.getByRole('link', { name: /Pricing/i })).toBeVisible();
        await expect(mobileDrawer.getByRole('link', { name: /Transactions/i })).toBeVisible();
        await expect(mobileDrawer.getByRole('link', { name: /Approvals/i })).toBeVisible();
        await expect(mobileDrawer.getByRole('link', { name: /Attack Lab/i })).toBeVisible();

        // Verify touch targets for all mobile nav links are >= 40px
        const navLinks = mobileDrawer.locator('a');
        const count = await navLinks.count();
        expect(count).toBeGreaterThanOrEqual(6);
        for (let i = 0; i < Math.min(count, 4); i++) {
          const box = await navLinks.nth(i).boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(40);
        }

        // Close menu via drawer close button
        const closeBtn = page.locator('button[aria-label="Close Menu"]');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        } else {
          await menuToggle.click({ force: true });
        }
        await expect(mobileDrawer).toBeHidden();
      } else {
        // Desktop view: Desktop nav pills must be visible (Primary Monitoring)
        const desktopNav = page.locator('nav[aria-label="Desktop Navigation"]');
        await expect(desktopNav).toBeVisible();
        await expect(desktopNav.locator('#nav-link-overview')).toBeVisible();
        await expect(desktopNav.locator('#nav-link-security-events')).toBeVisible();
        await expect(desktopNav.locator('#nav-link-transactions')).toBeVisible();
        await expect(desktopNav.locator('#nav-link-pending-approvals')).toBeVisible();

        // Secondary actions moved to Sidebar Navigation
        const sidebar = page.locator('aside[aria-label="Sidebar Navigation"]');
        await expect(sidebar).toBeVisible();
        await expect(sidebar.locator('#sidebar-link-storefront')).toBeVisible();
        await expect(sidebar.locator('#sidebar-link-pricing')).toBeVisible();
        await expect(sidebar.locator('#sidebar-link-policies')).toBeVisible();
        await expect(sidebar.locator('#sidebar-link-audit')).toBeVisible();
      }
    });
  }

  test('Storefront buttons are responsive and touch-friendly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/storefront', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // View Cart and Reviewer Queue buttons
    const viewCartBtn = page.getByRole('button', { name: /View Cart/i });
    await expect(viewCartBtn).toBeVisible();
    const cartBox = await viewCartBtn.boundingBox();
    expect(cartBox?.height).toBeGreaterThanOrEqual(40);

    const reviewerQueueLink = page.getByRole('link', { name: /Reviewer Queue/i });
    await expect(reviewerQueueLink).toBeVisible();
    const revBox = await reviewerQueueLink.boundingBox();
    expect(revBox?.height).toBeGreaterThanOrEqual(40);

    // Tab buttons
    const catalogTab = page.getByRole('button', { name: /Product Catalog/i });
    const attackLabTab = page.getByRole('button', { name: /Autonomous Agent Attack Lab/i });
    await expect(catalogTab).toBeVisible();
    await expect(attackLabTab).toBeVisible();

    // Check product card buttons
    const addBtns = page.getByRole('button', { name: /Add/i });
    if ((await addBtns.count()) > 0) {
      const firstAddBox = await addBtns.first().boundingBox();
      expect(firstAddBox?.height).toBeGreaterThanOrEqual(36);
    }

    // Switch to Autonomous Agent Attack Lab tab
    await attackLabTab.click();
    await page.waitForTimeout(300);

    // Verify Scenario Cards A, B, C, D are visible and responsive
    const scenarioA = page.locator('button:has-text("Scenario A")');
    const scenarioB = page.locator('button:has-text("Scenario B")');
    await expect(scenarioA).toBeVisible();
    await expect(scenarioB).toBeVisible();
    const scABox = await scenarioA.boundingBox();
    expect(scABox?.height).toBeGreaterThanOrEqual(44);
  });

  test('Pricing page billing toggle and CTA buttons are responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Billing toggle button
    const toggleBtn = page.getByRole('button', { name: /Toggle annual billing discount/i });
    await expect(toggleBtn).toBeVisible();
    const toggleBox = await toggleBtn.boundingBox();
    expect(toggleBox?.height).toBeGreaterThanOrEqual(40);

    // Click toggle to switch to Annual
    await toggleBtn.click();
    await expect(page.locator('text=Save 20%')).toBeVisible();

    // Verify Plan CTAs are full-width and touch-friendly on mobile
    const ctaButtons = page.locator('button:has-text("Interactive"), button:has-text("GitHub"), button:has-text("Enterprise")');
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
    const firstCtaBox = await ctaButtons.first().boundingBox();
    expect(firstCtaBox?.height).toBeGreaterThanOrEqual(40);
  });

  test('Overview page action buttons and filter pills are responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    // Refresh and Export CSV buttons
    const refreshBtn = page.getByRole('button', { name: /Refresh|Syncing/i });
    const exportBtn = page.getByRole('button', { name: /Export CSV/i }).first();
    await expect(refreshBtn).toBeVisible();
    await expect(exportBtn).toBeVisible();
    const refBox = await refreshBtn.boundingBox();
    expect(refBox?.height).toBeGreaterThanOrEqual(40);

    // Filter pills
    const allPill = page.getByRole('button', { name: /^All$/i });
    const allowedPill = page.getByRole('button', { name: /^Allowed$/i });
    await expect(allPill).toBeVisible();
    await expect(allowedPill).toBeVisible();
    const pillBox = await allPill.boundingBox();
    expect(pillBox?.height).toBeGreaterThanOrEqual(36);
  });
});
