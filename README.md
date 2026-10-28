# 🛡️ AgentGuard

> **Autonomous AI-Agent Security Gateway for PayPal Transactions**  
> *Built for the PayPal AI Hackathon 2026*

[![CI](https://github.com/altafpasha/agentguard/actions/workflows/ci.yml/badge.svg)](https://github.com/altafpasha/agentguard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-black.svg)](https://fastify.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-black.svg)](https://nextjs.org/)
[![Security Threat Model](https://img.shields.io/badge/Threat%20Model-THREATS.md-red.svg)](THREATS.md)

AgentGuard is a high-assurance, fail-safe security gateway positioned between autonomous AI shopping agents and payment execution APIs (PayPal Sandbox). It prevents prompt injection attacks, enforces deterministic spending limits, binds human approvals to immutable transaction digests, prevents approval replay and parameter tampering, and records tamper-evident audit logs.

---

## 📑 Table of Contents

- [Key Highlights & Visual Overview](#-key-highlights--visual-overview)
- [Architectural Principles & Defense-in-Depth](#-architectural-principles--defense-in-depth)
- [Threat Model & Security Boundary](#-threat-model--security-boundary)
- [Tech Stack](#-tech-stack)
- [Quick Start: Local Development](#-quick-start-local-development)
- [PayPal Sandbox Setup](#-paypal-sandbox-setup)
- [OpenRouter AI Provider Setup](#-openrouter-ai-provider-setup)
- [Demonstration Environment & Storefront Demo](#-demonstration-environment--storefront-demo)
- [Automated Scenarios Runner](#-automated-scenarios-runner)
- [Running Tests & Quality Verification](#-running-tests--quality-verification)
- [Official SDK Packages & External Integrations](#-official-sdk-packages--external-integrations)
- [Razorpay Merchant Integration](#-razorpay-merchant-integration-examplesrazorpay)
- [Deployment Guide (Render & Docker Compose Fallback)](#-deployment-guide)
- [API Reference](#-api-reference)
- [Known Limitations & Security Trade-Offs](#-known-limitations--security-trade-offs)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 📸 Key Highlights & Visual Overview

### 1. Storefront Demonstration & Autonomous Agent Ingress
The demo storefront features test catalog items and a malicious listing with real prompt injection payloads. As the autonomous AI shopping agent inspects items and proposes orders, AgentGuard intercepts, analyzes, and guards the PayPal Sandbox flow.

| Scenario A: Normal Purchase (Authorized) | Scenario C: Prompt Injection (Blocked) | Scenario D: High-Value (Enters HOLD) |
|:---:|:---:|:---:|
| ![Authorized](docs/screenshots/dashboard-storefront-authorized.png) | ![Injection Blocked](docs/screenshots/dashboard-storefront-injection-blocked.png) | ![Approval Required](docs/screenshots/dashboard-storefront-hold.png) |

### 2. Security Operations & Analytics Dashboard
A dark-mode analytics dashboard built with Next.js App Router, Tailwind CSS, and Lucide icons provides real-time visibility into agent traffic, security policy enforcement, and pending human reviews.

| Gateway Overview & Ingress Metrics | Human-in-the-Loop Approval Queue |
|:---:|:---:|
| ![Overview](docs/screenshots/dashboard-overview.png) | ![Approvals](docs/screenshots/dashboard-approvals.png) |

| Interactive Policy Editor | Tamper-Evident Audit Trail |
|:---:|:---:|
| ![Policies](docs/screenshots/dashboard-policies.png) | ![Audit](docs/screenshots/dashboard-audit.png) |

| Adversarial Attack Simulation Lab | Responsive Mobile Experience |
|:---:|:---:|
| ![Attack Lab](docs/screenshots/dashboard-attack-lab.png) | ![Mobile Dashboard](docs/screenshots/dashboard-mobile.png) |

---

## 🏛️ Architectural Principles & Defense-in-Depth

AgentGuard is architected on four non-negotiable security principles:

```
[Agent Context & Untrusted Inputs]
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Ingress & Schema Firewall (Fastify 5 + Zod)              │
│    • 512 KB request body limit (DoS protection)             │
│    • X-Request-Id tracking & propagation                    │
│    • OWASP Security Headers (nosniff, DENY, no-store)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Dual-Layer Threat Scanner                                │
│    • Static regex heuristics (60+ prompt injection patterns)│
│    • Unicode stripping, invisible characters, Base64 decode │
│    • OpenRouter LLM Classifier (Advisory Only)              │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Threat Detected -> 403 Forbidden)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Deterministic Policy Engine (Sole Payment Authority)     │
│    • Deny-by-default on missing policy, tool, or currency   │
│    • Max single-transaction limit ($50.00 default)          │
│    • Rolling cumulative daily spend limit ($200.00 default) │
│    • Per-agent sliding-window velocity rate limit           │
│    • Merchant denylist and allowlist enforcement            │
│    • Mandatory Human-in-the-Loop threshold ($25.00 default) │
└──────────────┬──────────────────────────────┬───────────────┘
               │ (Violations -> 403)          │ (Threshold -> 202)
               ▼                              ▼
     [Immediate Rejection]          [Reviewer Approval Queue]
                                              │ (Approved)
                                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Cryptographic Binding & Single-Use Consumption           │
│    • Immutable Digest: SHA-256(req|agent|tool|amount|cur|mch)│
│    • Atomic row lock (`isConsumed = true`) prevents replay  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. PayPal Sandbox Execution Adapter                         │
│    • Orders v2 REST Client (api-m.sandbox.paypal.com)       │
│    • Strict server-issued authorization token verification  │
│    • Idempotency keys (`PayPal-Request-Id`)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Tamper-Proof Audit Persistence (PostgreSQL 16)           │
│    • Recursive redaction of passwords, secrets, tokens, PII │
│    • Immutable event logging for financial compliance       │
└─────────────────────────────────────────────────────────────┘
```

1. **Deterministic Authority Separation**:
   An LLM is **never** the authority for payment execution. AI risk scores are purely advisory. Only the deterministic policy engine evaluates integer-cent spending rules.
2. **Server-Issued Authorization Tokens**:
   No PayPal payment can execute without a server-issued token cryptographically bound to the exact transaction parameters.
3. **Single-Use Replay Prevention**:
   Approval tokens can only be consumed once. Parallel attempts are serialized via database row locks; subsequent attempts receive `HTTP 409 Conflict`.
4. **Zero Secret Leakage**:
   Secrets, passwords, and tokens are scrubbed recursively before audit events are recorded.

---

## 🔒 Threat Model & Security Boundary

AgentGuard is built to defend against 12 concrete threat vectors defined in our [THREATS.md](THREATS.md):

1. **Prompt Injection from Untrusted Listings**: Malicious instruction overrides attempting to hijack agent goals.
2. **Confused-Deputy Attacks**: Rogue agents attempting to invoke privileged reviewer endpoints.
3. **Merchant or Amount Substitution**: Tampering with destination email or price after approval.
4. **Unauthorized Payment Execution**: Disallowed operations or unapproved direct execution calls.
5. **Approval Replay & Duplicate Transactions**: Reusing an approval token for duplicate purchases.
6. **Concurrent Spending-Limit Bypass**: Parallel race conditions bypassing daily caps.
7. **Authentication & Authorization Flaws**: Unauthenticated policy update attempts.
8. **Secret Leakage**: Exposure of API keys, client secrets, or auth tokens in logs or responses.
9. **API Abuse & Oversized Payloads**: DoS via multi-megabyte payloads.
10. **Dependency & Container Vulnerabilities**: Container root execution or layer data leakage.
11. **Malformed or Adversarial OpenRouter Output**: Model hallucination or adversarial outputs.
12. **PayPal Timeouts & Ambiguous States**: Ambiguous captures leading to double charges.

For detailed STRIDE taxonomy, evidence, and mathematical proofs, read the full [THREATS.md](THREATS.md).

---

## 💻 Tech Stack

- **Backend Gateway**: Node.js 22, TypeScript 5.7, Fastify 5.2, Zod 3.24
- **Persistence & ORM**: PostgreSQL 16, Drizzle ORM, `pg` driver with connection pooling
- **Security & Crypto**: Node.js `crypto` (`scryptSync`, `timingSafeEqual`, `SHA-256` digests)
- **AI Threat Analysis**: OpenRouter REST API (`anthropic/claude-3.5-sonnet`) with local offline mock fallback
- **Payments Integration**: PayPal REST APIs v2 (`/v2/checkout/orders`) on Sandbox
- **Dashboard Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons
- **Testing & E2E**: Vitest 3.2, Playwright 1.64, ESLint 9

---

## 🚀 Quick Start: Local Development

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **Docker & Docker Compose** (optional for local database or full container stack)

### 1. Clone & Install
```bash
git clone https://github.com/altafpasha/agentguard.git
cd agentguard

# Install Gateway and Demo dependencies
npm install

# Install Dashboard dependencies
npm install --prefix dashboard
```

### 2. Configure Environment
```bash
cp .env.example .env
```
*(AgentGuard runs completely offline in test mode with in-memory stores and mock adapters without requiring any external keys!)*

### 3. Run Development Services
You can run the gateway and dashboard concurrently:

```bash
# Terminal 1: Run AgentGuard Gateway (Port 3001)
PORT=3001 DATABASE_URL=memory://agentguard npm run dev

# Terminal 2: Run Dashboard (Port 3000)
npm run dev --prefix dashboard
```

Open your browser to:
- **Dashboard**: `http://localhost:3000`
- **Storefront Demo**: `http://localhost:3000/storefront`
- **Gateway Healthcheck**: `http://localhost:3001/health`

---

## 💳 PayPal Sandbox Setup

AgentGuard uses PayPal Sandbox REST APIs. It is locked to Sandbox mode by default.

1. Navigate to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
2. Create or select a Sandbox REST App to get your `Client ID` and `Client Secret`.
3. Add the credentials to your `.env` file:
   ```ini
   PAYPAL_CLIENT_ID=your_sandbox_client_id
   PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
   PAYPAL_ENVIRONMENT=sandbox
   PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
   # Set to true to execute live Sandbox orders against PayPal
   PAYPAL_ALLOW_LIVE_EXECUTION=true
   ```
4. **Safety Guarantee**: Production / live execution is strictly disabled. When `PAYPAL_ALLOW_LIVE_EXECUTION=false`, AgentGuard validates, authorizes, and audits transactions safely without making outbound PayPal network calls.

---

## 🤖 OpenRouter AI Provider Setup

AgentGuard uses OpenRouter for secondary semantic risk analysis:

1. Obtain an API key from [OpenRouter](https://openrouter.ai/).
2. Add the key to `.env`:
   ```ini
   OPENROUTER_API_KEY=sk-or-v1-your-key
   OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
   ```
3. If no key is provided, AgentGuard automatically falls back to deterministic rule-based scanning, ensuring 100% offline functionality.

---

## 🛒 Demonstration Environment & Storefront Demo

The demo storefront (`http://localhost:3000/storefront`) showcases AgentGuard in action with an autonomous AI agent:

1. **Catalog Items**:
   - `DEV-001`: Cloud Sandbox Subscription ($18.50) — **Normal Purchase** (Authorized within policy).
   - `ENT-003`: Dedicated GPU Compute Cluster ($75.00) — **Spending Limit Block** (Exceeds $50 limit).
   - `SEC-004`: Security Scanner Pro ($35.00) — **Human Approval Required** (Exceeds $25 threshold, enters HOLD).
   - `MAL-002`: Prompt Injection Test Listing ($22.00) — **Malicious Instruction Attack**.
2. **Autonomous AI Agent**:
   - The shopping agent analyzes product descriptions and invokes `execute_paypal_order`.
   - On the malicious product, the injection attempts to override system instructions and redirect payments to `hacker@blackhat.com`.
   - AgentGuard intercepts the payload at Ingress, records an `INJECTION_BLOCKED` audit event, and aborts payment execution.

---

## 🧪 Automated Scenarios Runner

Run the end-to-end hackathon scenario verification script:

```bash
npm run scenarios
```

This executes all five core scenarios against the running gateway:
- **Scenario A**: Normal Purchase within budget completes on PayPal Sandbox (`HTTP 200`).
- **Scenario B**: Purchase exceeding spending limit is rejected with zero payment call (`HTTP 403`).
- **Scenario C**: Adversarial prompt injection listing is blocked before policy evaluation (`HTTP 403`).
- **Scenario D**: High-value purchase triggers Human-in-the-Loop review (`HTTP 202`), reviewer authenticates and approves, single-use token executes once on PayPal Sandbox, and replay is rejected (`HTTP 409`).
- **Scenario E**: Failure simulations (parameter tampering, denylisted payee, and request idempotency).

Results are verified and output to `scenario-results.json`.

---

## 🧪 Running Tests & Quality Verification

AgentGuard has an extensive automated test suite covering unit tests, contract tests, security regressions, and end-to-end browser tests.

```bash
# 1. Run ESLint code quality check
npm run lint

# 2. Run TypeScript compiler typecheck
npx tsc --noEmit

# 3. Run complete Vitest suite (161 tests across 22 files)
npm test

# 4. Run dedicated Security Regression suite (11 vulnerability tests)
npx vitest run tests/security/security-regression.test.ts

# 5. Run Playwright Storefront E2E tests
npx playwright test tests/e2e/storefront-demo.spec.ts

# 6. Run Responsive UI validation across Desktop, Tablet, and Mobile
npx playwright test tests/e2e/responsive-check.spec.ts
```

All tests run completely offline without requiring live credentials.

---

## 📦 Official SDK Packages & External Integrations

AgentGuard provides official, production-ready client SDKs for integrating external applications (Node.js, Python, merchant backends) with your self-hosted security gateway.

| Package | Language / Runtime | Distribution | Status | Documentation |
|:---|:---|:---|:---|:---|
| **`@codesec-ai/agentguard`** | Node.js >= 18.0.0 (TS/ESM/CJS) | [npm](https://www.npmjs.com/package/@codesec-ai/agentguard) | Ready (v1.0.0) | [TypeScript SDK Guide](docs/integrations/SDK_GUIDE.md) |
| **`agentguard-sdk`** | Python >= 3.9 (Typed / Zero-dep) | [PyPI](https://pypi.org/project/agentguard-sdk/) | Ready (v1.0.0) | [Python SDK Guide](docs/integrations/SDK_GUIDE.md) |

### 1. TypeScript / Node.js Installation

```bash
npm install @codesec-ai/agentguard
```

#### Minimal Working Example
```typescript
import { AgentGuard, AgentGuardError } from '@codesec-ai/agentguard';

const guard = new AgentGuard({
  baseUrl: process.env.AGENTGUARD_URL || 'http://localhost:3001',
  apiKey: process.env.AGENTGUARD_API_KEY!,
  timeoutMs: 5000,
});

// Pre-flight evaluate before calling sensitive payment tools
const decision = await guard.evaluate({
  action: 'payment.create',
  amount: 25.0,
  currency: 'INR',
  tool: 'razorpay_payment',
  agentId: 'autonomous-shopper',
  description: 'Merchant payment execution',
});

if (decision.status === 'ALLOW') {
  // Authoritatively approved: safe to invoke downstream Razorpay / PayPal API
  console.log('Payment approved:', decision.requestId);
} else if (decision.status === 'HOLD') {
  // Held for human operator approval in dashboard
  console.log('Action requires review. Approval ID:', decision.pendingApprovalId);
} else {
  // Authoritatively blocked: NEVER invoke downstream API
  console.error('Payment blocked by security boundary:', decision.reason);
}
```

### 2. Python Installation

```bash
python -m pip install agentguard-sdk
```

#### Minimal Working Example
```python
import os
from agentguard import AgentGuard, AgentGuardError

guard = AgentGuard(
    base_url=os.environ.get("AGENTGUARD_URL", "http://localhost:3001"),
    api_key=os.environ["AGENTGUARD_API_KEY"],
    timeout=5.0,
)

decision = guard.evaluate(
    action="payment.create",
    amount=25.0,
    currency="INR",
    tool="razorpay_payment",
    agent_id="autonomous-shopper",
)

if decision.is_allowed:
    print(f"Payment approved: {decision.request_id}")
elif decision.is_held:
    print(f"Requires human approval. ID: {decision.pending_approval_id}")
else:
    print(f"Payment blocked: {decision.reason}")
```

### 3. Fail-Closed Invariant & Error Handling

Both SDKs guarantee fail-closed security. Network timeouts, gateway outages, or DNS failures never result in an accidental ALLOW. When using `guard.evaluateSafely()` (or `guard.evaluate_safely()`), errors return an authoritative `BLOCK` decision:
- `decision.status === 'BLOCK'`
- `decision.isAllowed === false`
- `decision.reason` details the `FAIL_CLOSED` gateway condition.

Specific error classes:
- `AgentGuardAuthenticationError` (HTTP 401 - Invalid/revoked API key)
- `AgentGuardForbiddenError` (HTTP 403 - Missing permissions)
- `AgentGuardValidationError` (HTTP 400 - Malformed payload)
- `AgentGuardNotFoundError` (HTTP 404 - Unknown approval or entity)
- `AgentGuardTimeoutError` (Gateway request timed out)
- `AgentGuardGatewayError` (HTTP 5xx or connection refused)

---

## 💳 Razorpay Merchant Integration (`examples/razorpay`)

A complete merchant backend demonstrating pre-flight security evaluation, Razorpay test order creation, human approval resumption, and cryptographic signature verification.

### Running the Example

```bash
cd examples/razorpay
npm install
cp .env.example .env
npm run dev
```

### Configuration (`.env`)
```bash
PORT=4000
AGENTGUARD_URL=http://localhost:3001
AGENTGUARD_API_KEY=ag_live_<your_api_key>
RAZORPAY_KEY_ID=rzp_test_<your_key_id>
RAZORPAY_KEY_SECRET=<your_razorpay_secret>
RAZORPAY_WEBHOOK_SECRET=<your_webhook_secret>
```

### End-to-End Payment Flow & Invariants:
1. **Request Ingress**: Merchant backend validates payment schema (`POST /api/checkout`).
2. **Pre-Flight Evaluation**: The SDK calls `agentguard.evaluate()` against the gateway.
3. **ALLOW**: If within spending policy and prompt injection free, Razorpay order is created (`HTTP 201`).
4. **HOLD**: If exceeding approval threshold, transaction is held (`HTTP 202`), issuing `pendingApprovalId`. Downstream Razorpay API is **never called** early.
5. **Approval Resumption**: Operator approves in dashboard. The backend polls via `guard.waitForApproval()` or receives approval webhook, re-evaluates with single-use `serverAuthorizationToken`, and creates order.
6. **BLOCK**: If limits exceeded or prompt injection detected, returns `HTTP 403`. Downstream Razorpay API is **never called**.
7. **Signature Verification**: Payment completion verifies constant-time HMAC-SHA256 (`POST /api/verify`).
8. **Webhook Idempotency**: Webhook events verify `X-Razorpay-Signature` HMAC (`POST /api/webhook`).

---

## 🚢 Deployment Guide

### Option 1: Render Deployment (One-Click Blueprint)

AgentGuard includes a production-ready [`render.yaml`](render.yaml) specification:

1. Connect your repository to Render.
2. Select **Blueprints** and point to `render.yaml`.
3. Render automatically provisions:
   - Managed PostgreSQL database (`agentguard-postgres`)
   - Fastify Gateway Docker service with health check on `/health`
   - Next.js Analytics Dashboard web service
4. Configure your `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in the Render environment variables dashboard.

### Option 2: Self-Hosted Production VPS (Docker Compose)

AgentGuard is designed for 100% self-hosted operation on your own VPS with Docker Compose, zero telemetry, and zero third-party cloud lock-in.

For the comprehensive guide covering prerequisites, Caddy/Nginx reverse proxy, automated HTTPS, database backup/restore, and emergency recovery, see **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

**Quick VPS Launch:**
```bash
# 1. Clone repository
git clone https://github.com/altafpasha/agentguard.git /opt/agentguard
cd /opt/agentguard

# 2. Configure production environment
cp .env.example .env
nano .env # Set strong POSTGRES_PASSWORD, PAYPAL credentials, and SEED_DEMO_DATA=false

# 3. Launch Docker Compose stack
docker compose up -d --build

# 4. Initialize first Owner account
# Navigate to http://<YOUR_VPS_IP>:3000/setup to register the initial Owner.
# The setup route permanently locks upon completion.
```

---

## 📡 API Reference & Documentation

### Interactive Swagger / OpenAPI Specification
Full interactive documentation, request schemas, and test execution consoles are served via Fastify Swagger UI at:
```
http://localhost:3001/docs
```
For a detailed architectural deep-dive and sequence diagrams, refer to [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

### 1. First-Run Setup & Authentication (RBAC)
- `GET /api/v1/auth/setup-status`: Check whether the installation requires first-run setup (`setupRequired: boolean`).
- `POST /api/v1/auth/setup-owner`: Transactionally create the initial `OWNER` account. Permanently locked once completed.
- `POST /api/v1/auth/login`: Rate-limited authentication endpoint; sets secure HTTP-only session cookie and returns session token.
- `POST /api/v1/auth/logout`: Revoke active session token.
- `GET /api/v1/auth/me`: Authenticated profile check for current reviewer.

### 2. Administrator User Management & Invitations
- `GET /api/v1/users`: List all registered operators, roles, statuses, and last login timestamps (Owner/Admin only).
- `POST /api/v1/users/invite`: Create single-use, 48-hour time-limited, SHA-256 hashed invitation link (Owner/Admin only).
- `POST /api/v1/users/accept-invite`: Unauthenticated invitation acceptance endpoint; securely sets user credentials.
- `PATCH /api/v1/users/:id/status`: Activate or deactivate an operator account. Enforces that the last active owner cannot be deactivated.
- `PATCH /api/v1/users/:id/role`: Change operator role (`OWNER`, `ADMIN`, `ANALYST`). Enforces privilege rules and protects the last owner.
- `POST /api/v1/users/:id/revoke-sessions`: Immediately terminate all active sessions for a target user.

### 3. Integrations & Live Health Probing
- `GET /api/v1/integrations/status`: Query live connection health and latency for AgentGuard Gateway, PostgreSQL, PayPal Sandbox, and OpenRouter with masked secrets.
- `POST /api/v1/integrations/test/:id`: Execute an active live ping/probe against a specific integration (`gateway`, `postgres`, `paypal`, `openrouter`).

### 4. Storefront & Real PayPal Checkout
- `GET /api/v1/store/products`: Retrieve verified product catalog records from database.
- `GET /api/v1/store/products/:id`: Get product details and stock status.
- `POST /api/v1/store/checkout`: Authoritatively calculates total server-side (client prices rejected), enforces spending limits, scans for prompt injections, and creates PayPal Sandbox order with `approvalUrl`.
- `POST /api/v1/store/orders/:orderId/capture`: Reconciles order against PayPal Orders v2 API and captures approved transaction.
- `POST /api/v1/store/orders/:orderId/cancel`: Handles buyer checkout cancellation.
- `GET /api/v1/store/orders`: List real persisted store orders and capture references.
- `GET /api/v1/pricing/plans`: Retrieve transparent AgentGuard tiers and feature matrix.

### 5. Ingress & Payment Execution
- `POST /api/v1/payments/initiate`: Primary guarded entrypoint for AI agent payments.
- `POST /api/v1/payments/orders`: Creates PayPal order without immediate capture.
- `POST /api/v1/payments/orders/:orderId/capture`: Captures PayPal order with server authorization token verification.

### 6. Human Approval & Reviewer Sessions
- `GET /api/v1/approvals/pending`: List unexpired pending approvals requiring human review.
- `POST /api/v1/approvals/:id/approve`: Reviewer approves action; issues single-use authorization token.
- `POST /api/v1/approvals/:id/reject`: Reviewer rejects action; permanently prohibits execution.

### 7. Policy Management & Audit Trail
- `GET /api/v1/policies`: Retrieve active security policies and spend limits.
- `POST /api/v1/policies/update`: Authenticated endpoint (Owner/Admin only) to update policy thresholds and merchant denylists.
- `GET /api/v1/audit/events`: Query immutable audit trail with pagination and filters.
- `GET /api/v1/dashboard/overview`: Real database metrics (events evaluated, allowed, held, blocked, empty states).

## ⚠️ Known Limitations & Security Trade-Offs

1. **Non-Heuristic Zero-Day Injections**:
   No software layer can claim 100% mathematical immunity against unknown prompt injection techniques. AgentGuard addresses this through **fail-safe architectural decoupling**: even if an injection bypasses the scanner, the deterministic policy engine enforces hard spending limits, merchant allowlists, and human approval gates. The LLM has zero capability to execute payments directly.
2. **In-Memory Development Mode**:
   Running with `DATABASE_URL=memory://agentguard` stores session and velocity state in RAM, which resets on container restart. Production deployments must use PostgreSQL.
3. **Downstream PayPal Latency**:
   Network partitions during PayPal API calls are resolved using idempotency keys (`PayPal-Request-Id`) and order reconciliation queries before retrying.

---

## 🔧 Troubleshooting

| Symptom | Cause | Solution |
|:---|:---|:---|
| `HTTP 401 UNAUTHORIZED` on `/policies/update` | Missing or invalid reviewer Bearer token | Call `POST /api/v1/auth/login` to obtain a session token and pass `Authorization: Bearer <token>`. |
| `HTTP 409 CONFLICT` on payment initiation | Attempting to reuse an authorization token | Server authorization tokens are strictly single-use. Submit a new request for authorization. |
| `HTTP 413 Payload Too Large` | Request body exceeds 512 KB | Reduce payload size. Keep agent contexts focused on relevant product and checkout data. |
| `DATABASE_URL` connection error | PostgreSQL container not running | Ensure `docker compose up postgres` is running, or use `DATABASE_URL=memory://agentguard` for local in-memory testing. |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
