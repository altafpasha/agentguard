import { describe, it, expect, beforeAll } from 'vitest';
import { HackathonScenarioRunner } from '../../src/demo/runner';

describe('PayPal AI Hackathon — End-to-End Scenarios Verification Suite', { timeout: 60000 }, () => {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:3001';
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
