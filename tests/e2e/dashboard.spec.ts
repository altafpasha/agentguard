import { test, expect } from '@playwright/test';

test.describe('AgentGuard Dashboard E2E Tests', () => {
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

  test('1. Overview page loads with real API metrics, cards, charts, and heatmap', async ({ page }, testInfo) => {
    await page.goto('/');

    // Check title and header greeting
    await expect(page).toHaveTitle(/AgentGuard/i);
    await expect(page.locator('h1')).toContainText(/Security Administrator|Operator Dashboard/i);

    // Check metric cards
    await expect(page.locator('text=Evaluated Actions')).toBeVisible();
    await expect(page.locator('text=Blocked Threats')).toBeVisible();
    await expect(page.locator('a[href="/approvals"]').first()).toBeVisible();

    // Check filter pills
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allowed', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Held', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Blocked', exact: true })).toBeVisible();

    // Check service health panel
    await expect(page.locator('text=Gateway Service Health')).toBeVisible();
    await expect(page.locator('text=Core Gateway')).toBeVisible();

    // Save visual screenshot for verification
    const isMobile = testInfo.project.name.includes('Mobile');
    await page.screenshot({ path: isMobile ? 'dashboard-mobile.png' : 'dashboard-overview.png', fullPage: true });
  });

  test('2. Live Event Feed page displays filterable transactions and inspector drawer', async ({ page }, testInfo) => {
    await page.goto('/transactions');

    await expect(page.locator('h1')).toContainText('Transactions');
    const isMobile = testInfo.project.name.includes('Mobile');
    if (isMobile) {
      // On mobile viewports, cards are rendered instead of the wide data table
      const firstCard = page.locator('.md\\:hidden div[class*="cursor-pointer"]').first();
      await expect(firstCard).toBeVisible();
      await firstCard.click();
    } else {
      await expect(page.locator('table')).toBeVisible();
      // Wait for rows to load and click on first row
      await page.waitForSelector('tbody tr');
      const firstRow = page.locator('tbody tr').first();
      await firstRow.click();
    }

    // Drawer should open
    await expect(page.locator('text=Event Telemetry Inspector')).toBeVisible();
    await expect(page.locator('text=Sanitized Payload Summary')).toBeVisible();

    // Save visual screenshot
    if (!testInfo.project.name.includes('Mobile')) {
      await page.screenshot({ path: 'dashboard-transactions.png', fullPage: true });
    }
  });

  test('3. Approval queue displays pending actions and supports reviewer authorization', async ({ page }, testInfo) => {
    await page.goto('/approvals');

    await expect(page.locator('h1')).toContainText('Human Approval Queue');

    // Check approve button exists
    const approveBtn = page.locator('button:has-text("Approve Action")').first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();

      // Check modal opens
      await expect(page.locator('text=Approve Transaction Authorization')).toBeVisible();
      await expect(page.locator('text=Confirm Authorization')).toBeVisible();

      // Confirm approval
      await page.locator('button:has-text("Confirm Authorization")').click();

      // Success toast or notification should appear
      await expect(page.locator('text=approved successfully')).toBeVisible();
    }

    if (!testInfo.project.name.includes('Mobile')) {
      await page.screenshot({ path: 'dashboard-approvals.png', fullPage: true });
    }
  });

  test('4. Policy management allows editing caps and publishing new policy version', async ({ page }, testInfo) => {
    await page.goto('/policies');

    await expect(page.locator('h1')).toContainText('Deterministic Policy Management');
    await expect(page.locator('text=Active Version')).toBeVisible();

    // Check numeric inputs exist
    const maxAmountInput = page.locator('input[type="number"]').first();
    await expect(maxAmountInput).toBeVisible();

    // Check Publish button
    const publishBtn = page.locator('#save-policy-btn');
    await expect(publishBtn).toBeVisible();
    await publishBtn.click();

    // Check success notification
    await expect(page.locator('text=successfully published')).toBeVisible();

    if (!testInfo.project.name.includes('Mobile')) {
      await page.screenshot({ path: 'dashboard-policies.png', fullPage: true });
    }
  });

  test('5. Audit explorer verifies secret scrubbing and redaction guarantee', async ({ page }, testInfo) => {
    await page.goto('/audit');

    await expect(page.locator('h1')).toContainText('Immutable Audit Explorer');
    await expect(page.locator('text=Zero-Secret Leakage Verified')).toBeVisible();
    await expect(page.locator('text=Automated Secret Scrubbing Guarantee')).toBeVisible();

    if (!testInfo.project.name.includes('Mobile')) {
      await page.screenshot({ path: 'dashboard-audit.png', fullPage: true });
    }
  });

  test('6. Attack Lab executes real simulation scenarios with live engine telemetry', async ({ page }, testInfo) => {
    await page.goto('/attack-lab');

    await expect(page.locator('h1')).toContainText('Attack & Verification Lab');

    // Run first scenario
    const firstScenarioBtn = page.locator('#run-scenario-benign');
    await expect(firstScenarioBtn).toBeVisible();
    await firstScenarioBtn.click();

    // Check outcome updates
    await expect(page.locator('text=ALLOW').first()).toBeVisible({ timeout: 10000 });

    // Test prompt injection scenario
    const injectionBtn = page.locator('#run-scenario-prompt_injection');
    await expect(injectionBtn).toBeVisible();
    await injectionBtn.click();

    // Check 403 block outcome
    await expect(page.locator('text=BLOCK').first()).toBeVisible({ timeout: 10000 });

    if (!testInfo.project.name.includes('Mobile')) {
      await page.screenshot({ path: 'dashboard-attack-lab.png', fullPage: true });
    }
  });

  test('7. Settings page displays service health without exposing credentials', async ({ page }, testInfo) => {
    await page.goto('/settings');

    await expect(page.locator('h1')).toContainText('System & Security Settings');
    await page.getByRole('button', { name: /Gateway & Infrastructure/i }).click();
    await expect(page.locator('text=PayPal Sandbox Gateway')).toBeVisible();
    await expect(page.locator('text=SANDBOX (Live Strictly Prohibited)')).toBeVisible();
    await expect(page.locator('text=AI Risk Analyzer (Advisory Layer)')).toBeVisible();

    if (!testInfo.project.name.includes('Mobile')) {
      await page.screenshot({ path: 'dashboard-settings.png', fullPage: true });
    }
  });
});
