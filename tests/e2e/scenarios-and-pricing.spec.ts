import { test, expect } from '@playwright/test';

test.describe('Open Source Positioning, Interactive Scenarios & Razorpay Integration', () => {
  const baseURL = 'http://localhost:3000';

  test('Landing Page displays Open Source, Scenarios & Razorpay Protection sections', async ({ page }) => {
    await page.goto(`${baseURL}/`);

    // Verify Title & Brand
    await expect(page).toHaveTitle(/AgentGuard/);

    // Verify Top Navbar
    const nav = page.locator('header');
    await expect(nav).toContainText('Capabilities');
    await expect(nav).toContainText('Scenarios');
    await expect(nav).toContainText('Razorpay Protection');
    await expect(nav).toContainText('How It Works');
    await expect(nav).toContainText('Documentation');
    await expect(nav).toContainText('Open Source');

    // Verify Hero Section Action Buttons
    await expect(page.locator('#hero-explore-scenarios')).toBeVisible();
    await expect(page.locator('#hero-read-docs')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Integrate Razorpay' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Self-Host AgentGuard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View on GitHub' }).first()).toBeVisible();

    // Verify Prominent Scenarios Section
    const scenariosSection = page.locator('#scenarios');
    await expect(scenariosSection).toBeVisible();
    await expect(scenariosSection).toContainText('Real Security Scenarios, Tested Live');
    await expect(scenariosSection).toContainText('Prompt Injection Defense');
    await expect(scenariosSection).toContainText('Deterministic Spending Caps');
    await expect(scenariosSection).toContainText('Unauthorized Tool Invocation');
    await expect(scenariosSection).toContainText('Razorpay Payment Protection');
    await expect(scenariosSection).toContainText('Human-in-the-Loop Review (HITL)');

    // Verify Razorpay Section
    const razorpaySection = page.locator('#razorpay');
    await expect(razorpaySection).toBeVisible();
    await expect(razorpaySection).toContainText('Pre-Flight Security for Razorpay Operations');
    await expect(razorpaySection).toContainText('HMAC-SHA256 Signature Verification');
  });

  test('Pricing Page represents 100% Free Open Source with zero fake SaaS tiers', async ({ page }) => {
    await page.goto(`${baseURL}/pricing`);

    // Verify Open Source Headline
    await expect(page.locator('h1')).toContainText('Free Forever. Self-Hosted.');
    await expect(page.locator('body')).toContainText('Zero SaaS Lock-in');
    await expect(page.locator('body')).toContainText('$0 Software License');

    // Verify absence of fake prices / upgrade tiers
    const pageText = await page.textContent('body');
    expect(pageText).not.toContain('$29/mo');
    expect(pageText).not.toContain('$49/mo');
    expect(pageText).not.toContain('$99/mo');
    expect(pageText).not.toContain('Upgrade to Pro');
    expect(pageText).not.toContain('Contact Sales');

    // Verify transparent infrastructure breakdown
    await expect(page.locator('body')).toContainText('What Does It Cost to Run AgentGuard?');
    await expect(page.locator('body')).toContainText('$0 / month');
    await expect(page.locator('body')).toContainText('$5 – $20 / mo');

    // Verify GitHub repository link
    const githubLink = page.locator('a[href*="github.com/altafpasha/agentguard"]');
    await expect(githubLink.first()).toBeVisible();
  });

  test('Interactive Scenarios Workbench executes real backend evaluation', async ({ page }) => {
    await page.goto(`${baseURL}/scenarios`);

    // Verify Scenario tabs
    await expect(page.locator('body')).toContainText('Interactive Security Scenarios');
    await expect(page.getByText('Prompt Injection').first()).toBeVisible();
    await expect(page.getByText('Spending Limit').first()).toBeVisible();
    await expect(page.getByText('Unauthorized Tool').first()).toBeVisible();
    await expect(page.getByText('Razorpay Payment').first()).toBeVisible();
    await expect(page.getByText('Human Approval (HITL)').first()).toBeVisible();

    // Run Scenario A (Prompt Injection)
    const runButton = page.getByRole('button', { name: /Run Demo Action/i });
    await expect(runButton).toBeVisible();
    await runButton.click();

    // Verify real backend response
    await expect(page.locator('body')).toContainText('BLOCK');
    await expect(page.locator('body')).toContainText('Detected adversarial prompt injection patterns');
    await expect(page.locator('body')).toContainText('Tamper-evident forensic event persisted to audit ledger');

    // Switch to Scenario B (Spending Limit)
    await page.getByText('Spending Limit').first().click();
    await runButton.click();
    await expect(page.locator('body')).toContainText('BLOCK');
    await expect(page.locator('body')).toContainText('MAX_AMOUNT_EXCEEDED');

    // Test Reset Demo State
    const resetButton = page.getByRole('button', { name: /Reset Demo State/i });
    await resetButton.click();
    await expect(page.locator('body')).toContainText('Demo scenario states and ephemeral spend counters have been safely reset');
  });

  test('/attack-lab cleanly redirects to /scenarios', async ({ page }) => {
    await page.goto(`${baseURL}/attack-lab`);
    await page.waitForURL('**/scenarios');
    expect(page.url()).toContain('/scenarios');
  });

  test('Documentation includes Chapter 9 Razorpay Payment Protection', async ({ page }) => {
    await page.goto(`${baseURL}/docs`);

    const toggle = page.getByRole('button', { name: 'Toggle Documentation Navigation' });
    if (await toggle.isVisible()) {
      await toggle.click({ force: true });
    }

    // Click Chapter 9
    const chapter9Link = page.getByRole('button', { name: /9\. Razorpay Payment Protection/i });
    await chapter9Link.scrollIntoViewIfNeeded();
    await expect(chapter9Link).toBeVisible();
    await chapter9Link.click();

    // Verify content
    await expect(page.locator('h1')).toContainText('9. Razorpay Payment Protection');
    await expect(page.locator('body')).toContainText('Architecture & Pre-Flight Flow');
    await expect(page.locator('body')).toContainText('RAZORPAY_KEY_ID');
    await expect(page.locator('body')).toContainText('Running Sample Merchant App');
    await expect(page.locator('body')).toContainText('HMAC-SHA256 Signature Verification');
    await expect(page.locator('body')).toContainText('crypto.timingSafeEqual');
  });
});
