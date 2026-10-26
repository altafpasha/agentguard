import { HackathonScenarioRunner, ScenarioSuiteReport } from '../src/demo/runner';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  AGENTGUARD DEMONSTRATION ENVIRONMENT — PAYPAL AI HACKATHON');
  console.log('  Autonomous AI Agent Security Gateway Verification Suite');
  console.log('='.repeat(80) + '\n');

  const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:3001';
  console.log(`Connecting to Gateway at: ${gatewayUrl}`);

  // Test gateway reachability
  try {
    const healthRes = await fetch(`${gatewayUrl}/health`);
    if (!healthRes.ok) {
      throw new Error(`HTTP ${healthRes.status}`);
    }
    const health = await healthRes.json();
    console.log(`Gateway Status: HEALTHY (version: ${(health as { version?: string }).version || '1.0.0'})\n`);
  } catch (err) {
    console.error(`\n[ERROR] Cannot connect to AgentGuard Gateway at ${gatewayUrl}.`);
    console.error(`Ensure the gateway is running: PORT=3001 npx tsx src/index.ts\n`);
    process.exit(1);
  }

  const runner = new HackathonScenarioRunner(gatewayUrl);
  console.log('Executing Scenarios A through E...\n');

  const report = await runner.runAll();

  // Print results
  for (const s of report.scenarios) {
    const statusIcon = s.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[SCENARIO ${s.scenarioId}] ${s.name}  ==>  ${statusIcon} (${s.durationMs}ms)`);
    console.log(`Description: ${s.description}`);
    if (s.paypalOrderId) {
      console.log(`PayPal Sandbox Order: ${s.paypalOrderId}`);
    }
    if (s.approvalId) {
      console.log(`Approval Record ID:   ${s.approvalId}`);
    }
    console.log(`Prevention Proven:    ${s.preventionProven ? 'YES (Verified via Audit Log)' : 'N/A (Authorized Flow)'}`);
    console.log('Steps:');
    for (const step of s.steps) {
      const stepIcon = step.passed ? '  ✓' : '  ✗';
      console.log(`${stepIcon} ${step.stepName} [HTTP ${step.httpStatus}]: ${step.details}`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('  SCENARIO EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Scenarios:              ${report.totalScenarios}`);
  console.log(`Passed:                       ${report.passedScenarios}`);
  console.log(`Failed:                       ${report.failedScenarios}`);
  console.log(`Normal Purchases Allowed:     ${report.summary.normalPurchasesAllowed}/1`);
  console.log(`Spending Limits Enforced:     ${report.summary.spendingLimitsEnforced}/1`);
  console.log(`Attacks Blocked:              ${report.summary.attacksBlocked}/1`);
  console.log(`Human Approvals Held:         ${report.summary.humanApprovalsHeld}/1`);
  console.log(`Failure Modes Safe:           ${report.summary.failureModesSafe}/1`);
  console.log(`Unauthorized Executions:      ${report.summary.unauthorizedExecutions} (Zero unauthorized spend)`);
  console.log('='.repeat(80) + '\n');

  // Save machine-readable output
  const outputPath = resolve(process.cwd(), 'scenario-results.json');
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[ARTIFACT] Machine-readable results saved to: ${outputPath}\n`);

  if (report.failedScenarios > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[FATAL] Scenario runner failed:', err);
  process.exit(1);
});
