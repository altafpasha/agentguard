import { describe, it, expect, beforeAll } from 'vitest';
import { HackathonScenarioRunner } from '../../src/demo/runner';

// Evaluate whether live gateway testing is explicitly requested in environment
const explicitGatewayUrl = process.env.GATEWAY_URL;
const isLiveGatewayRequested =
  process.env.RUN_LIVE_GATEWAY === 'true' ||
  process.env.RUN_HACKATHON_SCENARIOS === 'true' ||
  Boolean(explicitGatewayUrl);

const gatewayUrl = explicitGatewayUrl || 'http://127.0.0.1:3001';

/**
 * PayPal AI Hackathon — End-to-End Scenarios Verification Suite.
 *
 * NOTE: These tests run full autonomous shopping agent scenarios (A through E)
 * against a live AgentGuard gateway server and the PayPal Sandbox API.
 * They are conditionally skipped when a live gateway is not requested (RUN_LIVE_GATEWAY / GATEWAY_URL),
 * preventing ECONNREFUSED in offline and CI environments.
 */
describe.skipIf(!isLiveGatewayRequested)(
  'PayPal AI Hackathon — End-to-End Scenarios Verification Suite',
  { timeout: 60000 },
  () => {
    let runner: HackathonScenarioRunner;

    beforeAll(async () => {
      runner = new HackathonScenarioRunner(gatewayUrl);
      // Ensure gateway is reachable
      const res = await fetch(`${gatewayUrl}/health`);
      expect(res.ok).toBe(true);
    });

  it('[SCENARIO A] Normal purchase within budget completes successfully on PayPal Sandbox', async () => {
    const result = await runner.runScenarioA();
    expect(result.passed).toBe(true);
    expect(result.scenarioId).toBe('A');
    expect(result.executionDispatched).toBe(true);
    expect(result.paypalOrderId).toBeDefined();
    expect(result.paypalOrderId!.length).toBeGreaterThan(5);
    expect(result.auditVerified).toBe(true);
  });

  it('[SCENARIO B] Transaction exceeding spending limit is blocked with zero execution', async () => {
    const result = await runner.runScenarioB();
    expect(result.passed).toBe(true);
    expect(result.scenarioId).toBe('B');
    expect(result.preventionProven).toBe(true);
    expect(result.executionDispatched).toBe(false);
    expect(result.paypalOrderId).toBeUndefined();
    expect(result.auditVerified).toBe(true);
  });

  it('[SCENARIO C] Adversarial prompt injection is detected and blocked with zero execution', async () => {
    const result = await runner.runScenarioC();
    expect(result.passed).toBe(true);
    expect(result.scenarioId).toBe('C');
    expect(result.preventionProven).toBe(true);
    expect(result.executionDispatched).toBe(false);
    expect(result.paypalOrderId).toBeUndefined();
    expect(result.auditVerified).toBe(true);
  });

  it('[SCENARIO D] High-value purchase requires human approval, executes once, and rejects replay', async () => {
    const result = await runner.runScenarioD();
    expect(result.passed).toBe(true);
    expect(result.scenarioId).toBe('D');
    expect(result.preventionProven).toBe(true);
    expect(result.executionDispatched).toBe(true);
    expect(result.paypalOrderId).toBeDefined();
    expect(result.approvalId).toBeDefined();
    // Step 5 checked single-use replay prevention
    const replayStep = result.steps.find((s) => s.stepName === 'Single-Use Replay Prevention');
    expect(replayStep?.passed).toBe(true);
    expect(replayStep?.httpStatus).toBe(409);
  });

  it('[SCENARIO E] Failure and replay simulations safely reject unauthorized executions', async () => {
    const result = await runner.runScenarioE();
    expect(result.passed).toBe(true);
    expect(result.scenarioId).toBe('E');
    expect(result.preventionProven).toBe(true);
    expect(result.executionDispatched).toBe(false);

    // Verify all 5 sub-steps passed
    for (const step of result.steps) {
      expect(step.passed).toBe(true);
    }
  });

  it('Runs full scenario suite and emits complete machine-readable report', async () => {
    const report = await runner.runAll();
    expect(report.totalScenarios).toBe(5);
    expect(report.passedScenarios).toBe(5);
    expect(report.failedScenarios).toBe(0);
    expect(report.summary.unauthorizedExecutions).toBe(0);
    expect(report.summary.normalPurchasesAllowed).toBe(1);
    expect(report.summary.spendingLimitsEnforced).toBe(1);
    expect(report.summary.attacksBlocked).toBe(1);
    expect(report.summary.humanApprovalsHeld).toBe(1);
    expect(report.summary.failureModesSafe).toBe(1);
  });
});

// Fallback label when live gateway is not requested in environment
describe.skipIf(isLiveGatewayRequested)(
  '[SKIPPED: Live AgentGuard Gateway not running for Hackathon Scenarios]',
  () => {
    it('notifies engineer that live hackathon scenarios were bypassed safely', () => {
      console.log(
        'ℹ️ Live Hackathon E2E scenarios test suite was safely bypassed because a live AgentGuard gateway server was not detected or requested. To run against a live running gateway, start the gateway with SEED_DEMO_DATA=true and set RUN_LIVE_GATEWAY=true or GATEWAY_URL=http://127.0.0.1:3001.'
      );
      expect(true).toBe(true);
    });
  }
);

