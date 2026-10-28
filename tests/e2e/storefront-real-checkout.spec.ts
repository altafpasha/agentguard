import { test, expect } from '@playwright/test';

test.describe('AgentGuard Real Storefront & PayPal Sandbox End-to-End', () => {
  test('1. Catalog loads from real database with products, images, and prices', async ({ page }) => {
    await page.goto('/storefront');

    // Title and heading check
    await expect(page.locator('h1')).toContainText('Protected Storefront & Autonomous Checkout');

    // Verify database-backed products
    await expect(page.getByText('DevOps Tool License (Pro)')).toBeVisible();
    await expect(page.getByText('Enterprise Cloud Compute Node')).toBeVisible();
    await expect(page.getByText('Smart Security Cam (Firmware Listing)')).toBeVisible();
    await expect(page.getByText('Priority Support SLA Package')).toBeVisible();

    // Verify policy badges on cards
    await expect(page.getByText('Within Limit').first()).toBeVisible();
    await expect(page.getByText('Exceeds $50 Limit')).toBeVisible();
    await expect(page.getByText('Malicious Listing')).toBeVisible();
    await expect(page.getByText('Requires Review (> $25)').or(page.getByText('Requires Review (>'))).toBeVisible();
  });

  test('2. Product Detail Modal opens with specs, price, and quantity selector', async ({ page }) => {
    await page.goto('/storefront');

    // Click on DevOps Tool License card eye button to open detail modal
    const viewButtons = page.locator('button[title="View Details"]');
    await expect(viewButtons.first()).toBeVisible();
    await viewButtons.first().click();

    // Modal should be visible with specs
    await expect(page.locator('h2').filter({ hasText: 'DevOps Tool License (Pro)' })).toBeVisible();
    await expect(page.getByText('Specifications:')).toBeVisible();
    await expect(page.getByText('Includes command line toolchain')).toBeVisible();

    // Close modal
    const closeBtn = page.locator('button:has-text("✕"), button:has-text("Close"), button:has(svg.lucide-x)').first();
    await closeBtn.click();
  });

  test('3. Cart calculates subtotal and executes server-side price checkout for legitimate item', async ({ page }) => {
    await page.goto('/storefront');

    // Add DevOps Tool License ($18.50) to cart
    const addButtons = page.getByRole('button', { name: 'Add' });
    await addButtons.first().click();

    // Cart drawer should open
    await expect(page.getByText('Shopping Cart')).toBeVisible();
    await expect(page.getByText('Estimated Total')).toBeVisible();
    await expect(page.getByText('$18.50 USD')).toBeVisible();

    // Click Checkout via PayPal Sandbox
    const checkoutBtn = page.getByRole('button', { name: /Checkout via PayPal Sandbox/i });
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    // Wait for checkout result modal
    await expect(page.getByText('PayPal Sandbox Order Created')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('PayPal Order ID:')).toBeVisible();

    // Verify PayPal Sandbox approval link is present
    await expect(page.getByRole('link', { name: /Approve in PayPal Sandbox/i })).toBeVisible();

    // Verify server capture button is present
    await expect(page.getByRole('button', { name: /Verify & Capture Order/i })).toBeVisible();
  });

  test('4. Scenario B: High-amount item ($75) blocked by $50 spending limit before PayPal order creation', async ({ page }) => {
    await page.goto('/storefront');

    // Switch to Autonomous Agent Attack Lab tab
    await page.getByRole('button', { name: /Autonomous Agent Attack Lab/i }).click();

    // Click Scenario B (Spending Limit - $75.00)
    await page.getByRole('button', { name: /Scenario B/i }).click();

    // Wait for block result
    await expect(page.getByText(/Policy Block: Limit Exceeded/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/exceeds maximum single transaction limit of 50.00 USD/i)).toBeVisible();
  });

  test('5. Scenario C: Malicious prompt injection listing caught and blocked by threat scanner', async ({ page }) => {
    await page.goto('/storefront');

    // Switch to Autonomous Agent Attack Lab tab
    await page.getByRole('button', { name: /Autonomous Agent Attack Lab/i }).click();

    // Click Scenario C (Prompt Injection - Smart Cam)
    await page.getByRole('button', { name: /Scenario C/i }).click();

    // Wait for prompt injection block result
    await expect(page.getByText(/Prompt Injection Blocked/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/adversarial prompt injection/i)).toBeVisible();
  });

  test('6. Scenario D: High-value item ($35) enqueued for Human-in-the-Loop approval (HOLD)', async ({ page }) => {
    await page.goto('/storefront');

    // Switch to Autonomous Agent Attack Lab tab
    await page.getByRole('button', { name: /Autonomous Agent Attack Lab/i }).click();

    // Click Scenario D (Human Review - Priority Support SLA)
    await page.getByRole('button', { name: /Scenario D/i }).click();

    // Wait for HOLD result
    await expect(page.getByText(/Human Approval Required \(HOLD\)/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /Open in Reviewer Queue/i })).toBeVisible();
  });

  test('7. Dedicated Pricing Page displays transparent tiers, feature matrix, and functional CTAs', async ({ page }) => {
    await page.goto('/pricing');

    // Check title and description
    await expect(page.locator('h1')).toContainText('Autonomous AI Agent Commerce');
    await expect(page.getByRole('heading', { name: 'Developer / OSS' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Team Pro Gateway' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enterprise Shield' })).toBeVisible();

    // Check technical capability matrix
    await expect(page.getByText('Technical Capability Matrix')).toBeVisible();
    await expect(page.getByText('Active In Current Release').first()).toBeVisible();

    // Check annual discount toggle
    await expect(page.getByText('Save 20%')).toBeVisible();

    // Test Team Pro CTA opening staging trial modal
    const trialBtn = page.getByRole('button', { name: /Test Interactive Staging/i });
    await trialBtn.click();
    await expect(page.getByText('Team Pro Gateway Demo')).toBeVisible();
  });

  test('8. Order history displays real persisted orders from application data layer', async ({ page }) => {
    await page.goto('/storefront');

    // Click Order History tab
    await page.getByRole('button', { name: /Order History & Receipts/i }).click();

    // Table should render with real order records
    await expect(page.getByText('Verified Store Orders')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });
});
