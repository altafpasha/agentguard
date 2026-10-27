# @codesec-ai/agentguard

Official Node.js & TypeScript SDK for the **AgentGuard** AI Agent Security Gateway.

AgentGuard intercepts, evaluates, and verifies autonomous AI agent actions against deterministic spending limits, currency controls, capability whitelists, and adversarial prompt injection heuristic scans before downstream payment APIs (such as Razorpay or PayPal) are executed.

---

## Installation

```bash
npm install @codesec-ai/agentguard
# or
yarn add @codesec-ai/agentguard
# or
pnpm add @codesec-ai/agentguard
```

---

## Quickstart

### ESM (TypeScript / Modern Node)
```typescript
import { AgentGuard } from '@codesec-ai/agentguard';

const agentguard = new AgentGuard({
  baseUrl: process.env.AGENTGUARD_URL || 'http://localhost:3001',
  apiKey: process.env.AGENTGUARD_API_KEY!,
  timeoutMs: 5000,
});
```

### CommonJS
```javascript
const { AgentGuard } = require('@codesec-ai/agentguard');

const agentguard = new AgentGuard({
  baseUrl: process.env.AGENTGUARD_URL || 'http://localhost:3001',
  apiKey: process.env.AGENTGUARD_API_KEY,
});
```

### Pre-flight Action Evaluation
```typescript
async function handleAgentCheckout() {
  const decision = await agentguard.evaluate({
    action: 'payment.create',
    amount: 1200.0,
    currency: 'INR',
    recipient: 'merchant@store.com',
    description: 'Autonomous grocery restocking order',
    promptContext: 'User prompt: Restock organic coffee and paper towels.',
  });

  if (decision.status === 'ALLOW') {
    console.log(`Action permitted! Policy version: ${decision.policyVersion}`);
    console.log(`Server authorization token: ${decision.authorizationToken}`);
    // Pass decision.authorizationToken to your backend payment rail (e.g. Razorpay/PayPal)
  } else if (decision.status === 'HOLD') {
    console.warn(`Action held for human review: ${decision.pendingApprovalId}`);
    // Wait for operator review: const approval = await agentguard.waitForApproval(decision.pendingApprovalId!);
  } else {
    console.error(`Blocked by AgentGuard: ${decision.reason}`, decision.violations);
    // Abort execution
  }
}
```

### Adversarial Prompt Scanning
```typescript
async function scanUserInput(prompt: string) {
  const scan = await agentguard.scanPrompt(prompt);
  if (scan.isThreatDetected) {
    console.warn(`Prompt threat detected [${scan.threatLevel}]:`, scan.findings);
    return false;
  }
  return true;
}
```

---

## Security Boundary Notice

> **Important**: AgentGuard SDK evaluates proposed agent operations against deterministic policies and issues single-use cryptographic authorization tokens (`decision.authorizationToken`). The SDK itself **does not execute or settle real payments**. Your application must pass this authorization token to your server-side payment execution endpoint, where it is verified before funds move.

---

## Key Features

- **Strict Fail-Closed Guarantee**: Timeouts, network interruptions, and gateway outages strictly reject operations rather than failing open. Use `evaluateSafely()` to guarantee an authoritative `BLOCK` decision without uncaught exceptions.
- **Human-in-the-Loop (HITL) Support**: High-value transactions trigger `HOLD` state and return `pendingApprovalId`. Poll with `client.waitForApproval(id)`.
- **Adversarial Prompt Scanning**: Provide `promptContext` or use `client.scanPrompt(input)` to detect prompt injection attempts before money moves. Returns structured findings even when threats trigger HTTP 403.
- **Dual Export**: Full support for both ECMAScript Modules (ESM) and CommonJS (CJS).
- **TypeScript First**: Full type definitions included out of the box.

---

## License

MIT © AgentGuard Security Team
