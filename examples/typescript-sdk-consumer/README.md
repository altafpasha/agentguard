# AgentGuard TypeScript SDK Consumer Example

A runnable reference application demonstrating how to integrate and enforce security policies with **`@codesec-ai/agentguard` (v1.0.1)** in an AI agent or backend payment service.

## Architecture & Security Model

```
[ AI Agent / User ]
        │
        ▼
[ 1. Pre-Execution Scan ] ───────> AgentGuard Gateway (/api/v1/scan)
   (Detects injection)                   │
                                         ▼ (Clean)
[ 2. Policy Evaluation ]  ───────> AgentGuard Gateway (/api/v1/evaluate)
   (Deterministic caps,                  │
    velocity, allowlists)                ├───────────────┬───────────────┐
                                         ▼               ▼               ▼
                                     [ ALLOW ]       [ HOLD ]        [ BLOCK ]
                                         │               │               │
                                   Valid Token?     Pending Review?   Halt Exec
                                         │               │               │
                                         ▼               ▼               ▼
[ 3. Downstream Execution ] ────> (Mock Payment)  (Poll Approval)    (Log & Alert)
```

### Critical Security Invariants

1. **Server-Side Enforcement**: Security decisions must never be evaluated or trusted from client-side code (browsers/mobile). All AgentGuard API calls must run server-side using secure environment variables.
2. **Fail-Closed Execution**: If the AgentGuard gateway is unreachable, times out, or returns an error, the consumer **must fail closed** and reject execution. Never assume a default ALLOW.
3. **Authorization Token Integrity**: On an `ALLOW` decision, the gateway returns a cryptographically unique `authorizationToken` (e.g. `auth_...`) bound to the specific `requestId`, `amount`, `currency`, and `recipient`. Downstream services must require and atomically consume this single-use token to prevent replay attacks and double spend.
4. **Human-in-the-Loop (`HOLD`)**: When a transaction exceeds automated velocity or amount thresholds, the gateway responds with `HOLD` and a `pendingApprovalId`. The downstream action **must not execute** until an operator approves the transaction in the AgentGuard Dashboard.
5. **Prompt Injection Threat Handling**: The gateway scan route (`/api/v1/scan`) rejects adversarial inputs with `HTTP 403 Forbidden` and a structured findings payload. The SDK parses this into a `PromptScanResult` with `isThreatDetected: true`. Unrelated 403 errors (e.g. firewall or invalid permissions) throw typed `AgentGuardForbiddenError` exceptions.

---

## Prerequisites

- Node.js >= 18.0.0
- Running AgentGuard Gateway (`http://localhost:3001`)
- AgentGuard API Key with `evaluate` permission (e.g. generated from the AgentGuard Dashboard at `http://localhost:3000/settings`)

---

## Quickstart

### 1. Install Dependencies

Dependencies are installed directly from the public npm registry (`@codesec-ai/agentguard@1.0.1`):

```bash
cd examples/typescript-sdk-consumer
npm install
```

### 2. Configure Environment

Copy the example environment file and configure your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
AGENTGUARD_BASE_URL=http://localhost:3001
AGENTGUARD_API_KEY=ag_live_your_actual_key_here
AGENTGUARD_TIMEOUT_MS=10000
```

### 3. Run the Test Suite

Run isolated unit tests covering ALLOW, BLOCK, HOLD, authentication failure, gateway failure, and prompt threat scanning:

```bash
npm test
```

### 4. Run the Live Demonstration

Run against your local AgentGuard gateway:

```bash
npm start
```

---

## Code Example

```typescript
import { AgentGuard, AgentGuardAuthenticationError } from '@codesec-ai/agentguard';

const guard = new AgentGuard({
  baseUrl: process.env.AGENTGUARD_BASE_URL || 'http://localhost:3001',
  apiKey: process.env.AGENTGUARD_API_KEY!,
  timeoutMs: 10000,
});

// 1. Scan user prompt for prompt injection
const scan = await guard.scanPrompt(userInput);
if (scan.isThreatDetected) {
  console.error('Prompt injection detected:', scan.findings);
  return;
}

// 2. Authoritatively evaluate proposed action
try {
  const result = await guard.evaluate({
    action: 'purchase_merchandise',
    amount: 45.00,
    currency: 'USD',
    recipient: 'vendor@example.com',
    agentId: 'shopping-agent-01',
  });

  if (result.decision === 'ALLOW') {
    // 3. Execute downstream only with authoritative server authorization token
    await paymentGateway.charge({
      token: result.authorizationToken!,
      amount: 45.00,
    });
  } else if (result.decision === 'HOLD') {
    console.log(`Transaction held for review. Approval ID: ${result.pendingApprovalId}`);
  } else if (result.decision === 'BLOCK') {
    console.error(`Transaction blocked: ${result.reason}`, result.violations);
  }
} catch (err) {
  // Fail closed
  console.error('Security evaluation failed; refusing downstream execution:', err);
}
```

---

## Downstream Mock Notice

This example uses a simulated payment processor in `src/mock-downstream.ts`. It verifies that single-use tokens cannot be reused and enforces token presence. In production, pass the `authorizationToken` to your backend checkout API, which verifies the token with AgentGuard before dispatching payments to Razorpay, PayPal, or Stripe.
