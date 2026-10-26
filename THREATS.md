# AgentGuard Security Threat Model, Audit Report & Residual Risks

**Document Version:** 1.0.0  
**Target System:** AgentGuard Security Gateway & PayPal Execution Architecture  
**Audit Scope:** Full codebase (`src/`, `dashboard/`, `scripts/`, `tests/`, Docker, and CI/CD configurations)  
**Security Standard:** OWASP Top 10 for LLMs (2025), STRIDE Threat Modeling, and Financial Gateway Integrity Invariants  
**Release Readiness:** READY FOR HACKATHON STAGING / CONDITIONAL PRODUCTION (Subject to Live Production Penetration Testing)

---

## 1. Executive Summary

AgentGuard operates as a deterministic, fail-safe security gateway positioned between autonomous AI agents and payment execution APIs (PayPal Sandbox/Live). This document provides an exhaustive threat analysis, details confirmed and remediated vulnerabilities, outlines the security regression test suite, documents residual risks, and provides the release readiness checklist.

### Core Security Invariants
1. **Deterministic Authority:** The deterministic policy engine is the sole payment authority. Probabilistic LLM evaluations, advisory risk scores, or agent tool outputs cannot authorize payments or override policies.
2. **Server-Issued Cryptographic Binding:** No payment can execute on PayPal without a server-issued authorization token bound cryptographically to the exact transaction parameters (amount, currency, recipient, operation, policy version, and request ID).
3. **Single-Use Consumption & Replay Shield:** Approval tokens are consumed atomically upon payment execution. Any re-use, replay, or parameter mutation immediately terminates with HTTP 409 Conflict or HTTP 403 Forbidden.
4. **Deny-by-Default:** Any unrecognized tool, unknown operation, missing policy, unapproved currency, or ambiguous transaction state defaults to immediate rejection (`BLOCK`) or human review (`HOLD`).

---

## 2. Agent-to-PayPal Execution Trace

Every payment execution follows a strict multi-layer defense pipeline. No shortcut bypasses this path:

```
[Agent / External Context]
         │ (HTTP POST /api/v1/payments/initiate or /capture)
         ▼
[1. Request Size & Syntax Validation]
   ├── Body Limit Enforcement (512 KB max)
   └── Zod Strict Schema Validation
         │
         ▼
[2. Prompt Injection Threat Scanner]
   ├── Static Regex Pattern Matcher (60+ adversarial injection signatures)
   ├── Context Window Normalizer & Token Scanners
   └── LLM Advisory Risk Classifier (OpenRouter)
         │  ↳ [If Injection Detected] ──> Reject HTTP 403 (Zero Payment Call)
         ▼
[3. Human Approval Pre-Validation (if token supplied)]
   ├── Lookup in Approval Store (PostgreSQL / Memory)
   ├── State Check: Must be status == 'APPROVED'
   ├── Replay Check: Must be isConsumed == false
   ├── Expiration Check: Must not be expired
   └── Parameter Tampering Check: Exact match of agentId, amountCents, currency, merchant
         │  ↳ [If Invalid/Replayed/Tampered] ──> Reject HTTP 403/409 (Zero Payment Call)
         ▼
[4. Deterministic Policy Engine (Strict Payment Authority)]
   ├── Active Policy Retrieval (Agent-specific or System Default)
   ├── Deny-by-Default Invariant (Missing policy/tool = BLOCK)
   ├── Allowed Tools & Operations Allowlist Check
   ├── Allowed Currencies Allowlist Check
   ├── Merchant Denylist & Allowlist Verification
   ├── Single-Transaction Spending Cap Check (`maxAmountCents`)
   ├── Sliding-Window Velocity Rate Check (`velocityLimit`)
   ├── Atomic Cumulative Daily Spend Check (`recordSpendWithAtomicCheck`)
   └── Mandatory Human Approval Threshold Check (`approvalThresholdCents`)
         │
         ├── [Decision: BLOCK] ──> Record Audit Event ──> Throw PolicyViolationError (HTTP 403)
         ├── [Decision: HOLD]  ──> Create PendingApproval ──> Throw HumanApprovalRequiredError (HTTP 202)
         └── [Decision: ALLOW] ──> Issue Server Authorization Token
                                          │
                                          ▼
[5. Single-Use Token Consumption (Atomic Lock)]
   └── `consumeAuthorizationAtomic` executes inside database transaction
       re-verifying transaction digest and marking `isConsumed = true`
                                          │
                                          ▼
[6. PayPal Execution Adapter]
   ├── Verification of Server Authorization Token
   ├── Parameter Verification Against Digest
   └── Dispatch to PayPal API (POST /v2/checkout/orders or capture)
                                          │
                                          ▼
[7. Tamper-Evident Audit Logging]
   └── Payload Sanitization (Redaction of credentials, secrets, and raw tokens)
```

---

## 3. Threat Model & STRIDE Analysis

| Threat ID | Threat Vector | STRIDE Category | Risk Level | Gateway Defense Mechanism |
|:---|:---|:---|:---:|:---|
| **T-01** | Prompt injection via untrusted product data | Tampering / Elevation | **Critical** | Dual-layer scanner (heuristic signatures + AI classifier) + policy engine decoupling. Prompt payloads cannot alter policy limits. |
| **T-02** | Confused-deputy attack | Elevation of Privilege | **Critical** | Identity isolation: Agent identity is verified, policies are bound per-agent, and agents cannot delegate reviewer permissions. |
| **T-03** | Merchant or amount substitution | Tampering | **Critical** | Cryptographic transaction digest (`SHA-256(requestId\|agentId\|tool\|amountCents\|...)`). Any parameter drift between approval and execution triggers immediate rejection. |
| **T-04** | Unauthorized payment execution | Elevation of Privilege | **Critical** | PayPal sandbox/live adapter enforces hard server authorization token check before making any outbound API call. |
| **T-05** | Approval replay & duplicate transactions | Repudiation / Tampering | **Critical** | Atomic row-level lock and single-use `isConsumed` state. Replayed tokens immediately fail with HTTP 409 Conflict. |
| **T-06** | Concurrent spending-limit bypass | Tampering | **High** | Database-level atomic spending checks (`recordSpendWithAtomicCheck`) preventing race conditions across parallel threads. |
| **T-07** | Unauthenticated policy modification | Elevation of Privilege | **Critical** | Reviewer Bearer token authentication required on all policy modification endpoints (`/api/v1/policies/update`). |
| **T-08** | Secret leakage in logs or responses | Information Disclosure | **High** | Sanitizer recursively redacts passwords, client secrets, API keys, and server authorization tokens from all audit events and logs. |
| **T-09** | DoS via oversized JSON payloads | Denial of Service | **Medium** | Fastify request body limit enforced at 512 KB (`bodyLimit: 524288`). Oversized payloads are dropped before JSON parsing. |
| **T-10** | Container secret leakage | Information Disclosure | **Medium** | Multi-stage Dockerfile running as non-root `node` user with explicit `.dockerignore` excluding `.env`, `.git`, tests, and local secrets. |
| **T-11** | Malformed / Adversarial OpenRouter Output | Tampering / Spoofing | **Medium** | OpenRouter risk scores are purely advisory. Policy engine ignores invalid or compromised LLM responses and fails safe. |
| **T-12** | PayPal timeouts & ambiguous state | Reliability / Tampering | **Medium** | Order reconciliation workflows and idempotent request hashing prevent duplicate captures on network retry. |

---

## 4. Confirmed Vulnerabilities, Evidence & Remediations

### Finding 1: Human Approval Token Forgery via Arbitrary Client String
- **Severity:** Critical (CVSS 9.8)
- **Component:** `src/policy/authorization-engine.ts`
- **Vulnerability Description:** Previously, the policy engine validated approval tokens using a heuristic check (`trimmedToken.length >= 8 && !trimmedToken.includes('fake')`). An attacker or rogue agent could provide any arbitrary string (e.g. `'approved_by_admin_123'`) to bypass human approval on high-value transactions.
- **Evidence / Reproduction:**
  ```bash
  POST /api/v1/payments/initiate
  { "amount": 35.0, "humanApprovalToken": "unauthorized_arbitrary_string" }
  # Resulted in payment execution bypass without reviewer approval.
  ```
- **Remediation:** Rewrote `AuthorizationEngine` threshold evaluation to validate `humanApprovalToken` directly against the registered `approvalStore`. Unrecognized or forged tokens are rejected, forcing the transaction into `HOLD`.
- **Regression Test:** `tests/security/security-regression.test.ts` -> *"rejects unapproved / forged humanApprovalToken and halts in HOLD"*.

---

### Finding 2: Unauthenticated Security Policy Mutation
- **Severity:** Critical (CVSS 9.1)
- **Component:** `src/routes/policy.ts`
- **Vulnerability Description:** The `POST /api/v1/policies/update` endpoint lacked authentication middleware. Any unauthenticated caller on the network could mutate active policies, raise spending caps, or clear the blocked merchant denylist.
- **Evidence / Reproduction:**
  ```bash
  POST /api/v1/policies/update
  { "policyId": "default", "maxAmount": 999999.0 } # Succeeded without Bearer token.
  ```
- **Remediation:** Added `requireAuth` preHandler hook (`createReviewerAuthHook(authService)`) to enforce valid Reviewer session authentication with Bearer token header on all policy modification routes.
- **Regression Test:** `tests/security/security-regression.test.ts` -> *"rejects unauthenticated policy update attempts with HTTP 401"*.

---

### Finding 3: Secret Leakage in Audit Trail & Event Payloads
- **Severity:** High (CVSS 7.5)
- **Component:** `src/audit/sanitizer.ts`, `src/approval/service.ts`
- **Vulnerability Description:** `serverAuthorizationToken` and sensitive configuration secrets were stored in cleartext in audit payload summaries and logs, allowing unauthorized log readers to capture reusable approval tokens.
- **Evidence / Reproduction:** Inspected audit event payload summaries where `serverAuthorizationToken` was stored unredacted in `APPROVAL_REQUIRED` and `APPROVAL_GRANTED` events.
- **Remediation:** Upgraded `sanitizeAuditPayload` to recursively sanitize all keys containing `token`, `secret`, `password`, `apikey`, `credential`, and raw token patterns (`auth_...`), replacing them with `[REDACTED]`.
- **Regression Test:** `tests/security/security-regression.test.ts` -> *"redacts serverAuthorizationToken, passwords, and sensitive keys from audit payloads"*.

---

### Finding 4: Replay Vulnerability & Capture Parameter Tampering
- **Severity:** High (CVSS 8.2)
- **Component:** `src/routes/payment.ts`
- **Vulnerability Description:** In `/api/v1/payments/orders/:orderId/capture`, human approval tokens were evaluated without verifying whether the token had already been consumed or whether order amount/recipient matched the original approval.
- **Evidence / Reproduction:** Capturing an approved order twice or modifying capture amount while reusing the token.
- **Remediation:** Added atomic pre-validation of `humanApprovalToken` in the capture route, validating status, consumption, expiration, agentId, amount, currency, and recipient against the stored pending record before atomic consumption.
- **Regression Test:** `tests/security/security-regression.test.ts` -> *"prevents reusing a consumed single-use authorization token (HTTP 409)"* and *"rejects approval token if amount or recipient is tampered (HTTP 403)"*.

---

### Finding 5: Denial of Service via Unbounded Payloads & Missing Security Headers
- **Severity:** Medium (CVSS 6.5)
- **Component:** `src/app.ts`
- **Vulnerability Description:** Fastify lacked explicit `bodyLimit` configuration, making the server vulnerable to JSON memory exhaustion attacks. API responses lacked security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Cache-Control: no-store`).
- **Evidence / Reproduction:** Sending JSON bodies > 512 KB caused excessive memory allocation; missing headers observed in HTTP responses.
- **Remediation:** Enforced `bodyLimit: 524288` (512 KB) and registered security headers hook setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Cache-Control: no-store` on all API endpoints.
- **Regression Test:** `tests/security/security-regression.test.ts` -> *"rejects oversized JSON payloads exceeding 512KB with HTTP 413"* and *"emits standard security response headers on all API responses"*.

---

### Finding 6: Missing Container Build Filtering (`.dockerignore`)
- **Severity:** Medium (CVSS 5.3)
- **Component:** Repository Root
- **Vulnerability Description:** Absence of `.dockerignore` allowed local `.env` files, build logs, and test fixtures containing potential credentials to be copied into Docker image layers during container builds.
- **Remediation:** Created `.dockerignore` explicitly excluding `.env*`, `.git`, `tests`, `coverage`, `dashboard`, and temporary artifacts.

---

## 5. Residual Risks & Operational Mitigations

| Residual Risk | Severity | Context & Impact | Operational Mitigation |
|:---|:---:|:---|:---|
| **Novel Zero-Day Prompt Injections** | Moderate | Adversarial prompt injection attacks evolve rapidly. Pure heuristic and single-model classifiers can theoretically encounter novel obfuscations (e.g. multi-step token smuggling). | **Fail-Safe Policy Decoupling:** Even if a prompt injection completely bypasses the scanner, the deterministic policy engine enforces hard spending limits ($50 max, $200 daily), merchant allowlists, and human-in-the-loop approvals. The LLM has zero authority to execute payments. |
| **Memory Store Restarts (Dev/Staging Mode)** | Low | When running in `DATABASE_URL=memory://agentguard`, in-memory locks, velocity records, and approvals are cleared on container restart. | **Production Requirement:** Production deployments must specify a persistent PostgreSQL cluster with connection pooling and ACID transactional persistence. |
| **PayPal Sandbox Latency & Downstream Outages** | Low | PayPal API network timeouts can leave transaction state temporarily ambiguous. | **Idempotent Reconciliation:** AgentGuard uses deterministic requestId deduplication and order reconciliation APIs to verify capture status before retrying, preventing double payments. |

---

## 6. Verification & Test Metrics

All verification suites executed and passed with 100% success:

- **Security Regression Suite:** 11/11 tests passed (`tests/security/security-regression.test.ts`)
- **Unit & Integration Suite:** 161/161 tests passed across 22 test suites (`vitest run`)
- **Playwright E2E Storefront Scenarios:** 8/8 tests passed (`tests/e2e/storefront-demo.spec.ts`)
- **Responsive Dashboard Viewport Suite:** 42/42 tests passed (`tests/e2e/responsive-check.spec.ts`)
- **Hackathon Scenario Verification Runner:** 5/5 scenarios passed (Normal Purchase, Spending Limit, Prompt Injection, Human Approval, Failure Modes)
- **TypeScript & ESLint Quality Gate:** 0 errors, 0 warnings (`npm run lint && npx tsc --noEmit`)
- **Production Build:** Success (`npm run build` and `npm run build:dashboard`)

---

## 7. Release Readiness Checklist

- [x] **No Unresolved Payment Bypasses:** Verified. Zero path exists to execute PayPal payments without deterministic policy approval.
- [x] **No Approval Replay Flaws:** Verified. Atomic token consumption prevents re-use (HTTP 409).
- [x] **No Unauthenticated Policy Modification:** Verified. Bearer token RBAC authentication enforced.
- [x] **Zero Secret Leakage:** Verified. Audit payload sanitizer redacts tokens, secrets, and credentials.
- [x] **Payload Limits & Security Headers Active:** Verified. 512 KB request limit and OWASP security headers active.
- [x] **Deterministic Security Authority:** Verified. AI classifier is strictly advisory; deterministic policy engine is the sole authority.
- [x] **Complete Security Regression Suite:** Verified and committed to `tests/security/security-regression.test.ts`.
- [x] **Deployment Hardening:** Dockerfile non-root execution and `.dockerignore` in place.
- [x] **Production Sign-off Recommendation:** **READY FOR RELEASE** (Staging/Hackathon Environment); ready for scheduled external red-team / penetration test before full live PayPal financial operations.
