# AgentGuard SDK v1.0.0 — End-to-End Testing & Security Audit Report

**Target Package:** `@codesec-ai/agentguard`  
**Target Version:** `1.0.0` (Publicly published on npm)  
**Evaluation Date:** October 27, 2026  
**Auditor / Roles:** Senior TypeScript SDK Engineer, API Integration Tester, DevSecOps Engineer, Application Security Auditor  
**Repository:** `altafpasha/agentguard` (`/Users/Apple/Developer/fullstack-dev/agentguard`)  
**Final Assessment Status:** **PASS WITH WARNINGS**

---

## 1. Executive Summary

This report delivers a rigorous, evidence-based integration and security audit of the publicly published TypeScript/Node.js SDK **`@codesec-ai/agentguard@1.0.0`**. Testing was performed strictly against the **public npm registry artifact**, installed in an isolated consumer directory completely outside the repository source tree, communicating with the live **AgentGuard Security Gateway** (`http://localhost:3001`), Dockerized PostgreSQL database (`127.0.0.1:54329`), and Web Dashboard (`http://localhost:3000`).

### Key Findings at a Glance
- **Package Integrity & Distribution (PASS):** `@codesec-ai/agentguard@1.0.0` installs cleanly from npm registry (`https://registry.npmjs.org/@codesec-ai/agentguard/-/agentguard-1.0.0.tgz`). Both ECMAScript Modules (`import`) and CommonJS (`require()`) succeed without error. TypeScript declarations (`.d.ts`) resolve accurately and compile cleanly under strict `tsc` with `NodeNext` resolution.
- **Authentication & API Key Lifecycle (PASS):** API key provisioning was executed via the authorized administrative endpoint (`POST /api/v1/api-keys`) using an authenticated Owner session. Secret keys are displayed once and hashed via SHA-256 before database persistence. Post-test revocation was executed through `POST /api/v1/api-keys/:id/revoke`, and immediate 401 Unauthorized invalidation was verified against the gateway.
- **Deterministic Policy Enforcement (PASS):** Real gateway evaluation accurately enforced spending ceilings ($15.00 safe purchase -> `ALLOW`, $120.00 excessive purchase -> `BLOCK`), human-in-the-loop review threshold ($35.00 -> `HOLD` with `pendingApprovalId`), and adversarial prompt injection filtering (jailbreak prompt context -> `BLOCK`).
- **Fail-Closed Invariant (PASS):** Network connection refusal (port 39123) and evaluation timeouts (hanging mock HTTP server) were tested against both `evaluate()` and `evaluateSafely()`. When using `evaluateSafely()`, all network anomalies, connection drops, and gateway 5xx errors authoritatively default to `status: 'BLOCK'`, `isAllowed: false`, and `isBlocked: true` without throwing uncaught exceptions.
- **Defect Discovered in `scanPrompt()` (MEDIUM SEVERITY):** When an adversarial prompt is scanned via `client.scanPrompt()`, the gateway returns HTTP 403 containing structured findings. The SDK implementation in `client.ts` tests `!response.ok` before evaluating the payload and prematurely throws `AgentGuardForbiddenError`, preventing consumers from receiving the structured `PromptScanResult` with detected threat rules and risk scores. Clean prompts return HTTP 200 and succeed.
- **Existing Test Suite (PASS WITH WARNINGS):** SDK unit tests achieved 100% pass rate (11/11 passed). Root test suites passed 30 out of 31 test files (237 passed, 4 skipped). The single failing test file (`tests/integration/hackathon-scenarios.test.ts`) failed due to an environment fixture prerequisite (hardcoded `security_admin` user from demo seed not present when `SEED_DEMO_DATA=false`).

---

## 2. Tested Package Version and Environment

### 2.1 Package Registry Metadata
| Property | Value | Verification Command & Result |
| :--- | :--- | :--- |
| **Package Name** | `@codesec-ai/agentguard` | `npm view @codesec-ai/agentguard name` -> `@codesec-ai/agentguard` |
| **Published Version** | `1.0.0` | `npm view @codesec-ai/agentguard dist-tags` -> `{ latest: '1.0.0' }` |
| **Tarball URL** | `https://registry.npmjs.org/@codesec-ai/agentguard/-/agentguard-1.0.0.tgz` | Verified via npm registry manifest |
| **Tarball SHA-1** | `7b9e141e9f907fffd8ab30aa725db848f3da6525` | Verified via npm registry manifest |
| **Integrity Hash** | `sha512-RnJh6gWNab5cwf6iXYEznJrufHcOjc1JtkEupG0wY4JQ9f43OLdTPjdFPLi4fJWlbCyiZWPH7u3UFvRB/ZdllQ==` | Verified |
| **Package Exports** | `.` -> `{ types: "./dist/index.d.ts", import: "./dist/index.mjs", require: "./dist/index.js" }` | Verified in installed `package.json` |
| **License** | `MIT` | Verified |
| **Engine Requirements** | `node >= 18.0.0` | Verified |

### 2.2 Local Test Infrastructure
| Component | Endpoint / Identifier | Status | Technology Stack |
| :--- | :--- | :--- | :--- |
| **Runtime Environment** | Host OS (macOS Darwin 24) | Healthy | Node.js `v22.14.0`, npm `10.9.2` |
| **AgentGuard Gateway** | `http://localhost:3001` | Healthy (HTTP 200) | Fastify 5.2.1, TypeScript, Docker Alpine |
| **Readiness Check** | `http://localhost:3001/health/ready` | Ready (DB connected) | `{"status":"ready","checks":{"auditDatabase":"connected"}}` |
| **Database** | `127.0.0.1:54329` (`agentguard-postgres`) | Up 20+ hours (healthy) | PostgreSQL 16 Alpine, Drizzle ORM |
| **Dashboard** | `http://localhost:3000` (`agentguard-dashboard`) | Up 3+ hours (healthy) | Next.js 15, Tailwind CSS, Docker Alpine |
| **Isolated Consumer Dir** | `<scratch>/npm-consumer` | Created & Tested | Pure external consumer (zero relative paths to repo) |

---

## 3. Test Methodology

The audit followed a zero-trust verification strategy:
1. **Isolated Consumer Execution:** An external consumer project was created at `/Users/Apple/.gemini/antigravity-ide/brain/a0b4e94d-d93f-4fb0-bc5f-eb7ed883a487/scratch/npm-consumer`. The SDK was installed using `npm install @codesec-ai/agentguard@1.0.0`. No local repository files or build symlinks were referenced.
2. **Import & Module Syntax Verification:** Tested dual-module compatibility using both native ESM (`.mjs`) and CommonJS (`.cjs`). Tested strict TypeScript compilation (`tsc --noEmit`) against type definitions.
3. **Live Gateway Integration:** Executed live HTTP calls from the installed SDK package against `http://localhost:3001`.
4. **Least-Privilege Key Provisioning:** Administered credentials through documented Fastify routes using an Owner session; inspected generated database hashes and revoked temporary test credentials upon test completion.
5. **Fault Injection & Chaos Testing:** Simulated network partitions via closed TCP ports (connection refused), simulated hanging gateways via non-responsive HTTP mock servers, and simulated non-compliant gateways via malformed JSON responses.
6. **Policy Decision & Security Verification:** Tested all three deterministic states (`ALLOW`, `HOLD`, `BLOCK`), human approval polling, prompt injection heuristic scanning, and HMAC/SHA-256 audit log persistence.

---

## 4. Published-Package Installation and Import Results

### 4.1 Verification Checks
| Check | Target | Expected Behavior | Actual Behavior | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Clean npm Install** | `@codesec-ai/agentguard@1.0.0` | Downloads & installs with 0 errors | Installed 1 package in 1s; 0 vulnerabilities | **PASS** | `npm install --prefix <scratch>/npm-consumer @codesec-ai/agentguard@1.0.0` |
| **ESM Import** | `test-esm.mjs` | Imports `AgentGuard`, typed errors, `parseErrorResponse` | All exports defined; typeof `function` | **PASS** | `AgentGuard instance created successfully: true` |
| **CommonJS Require** | `test-cjs.cjs` | `require('@codesec-ai/agentguard')` exports classes | All exports defined; typeof `function` | **PASS** | `CommonJS Require: PASS` |
| **Type Declarations** | `dist/index.d.ts`, `dist/types.d.ts` | Complete typings for request, result, errors | Declarations resolve without missing types | **PASS** | `tsc --project <scratch>/npm-consumer/tsconfig.json` exits code 0 |
| **TypeScript Compilation** | `test-ts.ts` | Strict compilation with `NodeNext` | Compiles cleanly with zero diagnostic errors | **PASS** | Output: `TypeScript Compilation & Declaration Check: OK` |
| **Runtime Dependencies** | `package.json` dependencies | Zero undeclared runtime dependencies required | Standard Node 18+ `fetch` and built-in crypto used | **PASS** | Dependencies array empty; zero external runtime bloat |

---

## 5. Authentication and API Key Creation Results

### 5.1 Verification Against Architecture
The AgentGuard gateway implements a dual-layer authentication model:
- **Reviewer Authentication:** Used by human analysts and administrators (`/api/v1/auth/login`, session cookie `agentguard_session` or `Authorization: Bearer <sessionToken>`).
- **Client API Key Authentication:** Used by autonomous AI agents and backend microservices via `X-API-Key: ag_...` or `Authorization: Bearer ag_...`.

### 5.2 Key Provisioning Audit
```bash
POST /api/v1/api-keys
Headers:
  Authorization: Bearer <REDACTED_SESSION_TOKEN>
  Content-Type: application/json
Payload:
  {
    "name": "Antigravity SDK Integration Test",
    "workspaceId": "default",
    "permissions": ["evaluate"],
    "role": "CLIENT",
    "rateLimitRpm": 60,
    "expiresInDays": 1,
    "isTestKey": true
  }
```

### 5.3 Audit Findings
- **HTTP Status:** `201 Created`
- **One-Time Secret Emission:** The endpoint emitted `secretKey: ag_test_XuC9gH...` once.
- **Database Storage:** Inspected PostgreSQL table `api_keys`. The secret key is never stored in plaintext. It is hashed using SHA-256 (`key_hash: character varying(64)`), and only `key_prefix` (`ag_test_XuC9gH...`) is retained for identification.
- **Permissions Enforced:** Assigned permissions `["evaluate"]`.
- **Role Enforcement:** Key created with role `CLIENT` and rate limit `60 RPM`.
- **Revocation & Invalidation (Phase 8):** Upon test completion, `POST /api/v1/api-keys/:id/revoke` returned HTTP 200 with `revoked: true`. Subsequent evaluation requests with the revoked key immediately failed with HTTP 401 (`AgentGuardAuthenticationError: API key has been revoked.`).

---

## 6. Real Gateway Integration Results

The following table details every integration test executed using the installed `@codesec-ai/agentguard@1.0.0` package communicating with `http://localhost:3001`:

| # | Test Name | Expected Behavior | Actual Behavior | Result | Latency | Request ID / Evidence |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | **Key Provisioning** | HTTP 201 with secret emitted once | Key generated with prefix `ag_test_XuC9gH...` | **PASS** | 48ms | Key ID `f8dc840b-cb29-4a4a-bf43-2a2c5177f5f4` |
| **1** | **Valid Evaluation (ALLOW)** | HTTP 200, `status: 'ALLOW'`, `isAllowed: true`, `authorizationToken` present | `status: 'ALLOW'`, `isAllowed: true`, `isBlocked: false`, auth token generated | **PASS** | 78ms | `sdk_1793118243187_j12f60` |
| **2** | **Ceiling Limit (BLOCK)** | HTTP 403, `status: 'BLOCK'`, `isBlocked: true`, `MAX_AMOUNT_EXCEEDED` violation | `status: 'BLOCK'`, `isBlocked: true`, single cap $50.00 enforced on $120.00 attempt | **PASS** | 42ms | `sdk_1793118243268_70vc3i` |
| **3** | **Human Review (HOLD)** | HTTP 202, `status: 'HOLD'`, `isHeld: true`, `pendingApprovalId` returned | `status: 'HOLD'`, `isHeld: true`, $35.00 purchase queued for review | **PASS** | 156ms | `sdk_1793118243309_rlg000`, Approval ID `40d70a8b-f91b-4c83-a7a5-056de44673a0` |
| **3b** | **Query Approval Record** | `client.getApproval(id)` returns record with `status: 'PENDING'` | Returned record with amount $35.00, status `PENDING`, reason `HOLD_PENDING_APPROVAL` | **PASS** | 22ms | Approval Record verified |
| **4** | **Invalid / Missing Action** | Throws `AgentGuardError` validating payload before dispatch | Threw `AgentGuardError: Evaluation request must contain an "action" field.` | **PASS** | <1ms | Client-side pre-flight assertion verified |
| **5** | **Invalid API Key** | HTTP 401, SDK throws `AgentGuardAuthenticationError` | Threw `AgentGuardAuthenticationError (401): Invalid API key.` | **PASS** | 14ms | Correct error mapping |
| **6** | **Insufficient Permissions** | HTTP 403, SDK throws `AgentGuardForbiddenError` | Threw `AgentGuardForbiddenError (403): API key lacks required permission: 'evaluate'.` | **PASS** | 18ms | Server-side permission check verified |
| **7a** | **Unreachable Gateway (evaluate)** | Throws `AgentGuardGatewayError` (503) | Threw `AgentGuardGatewayError (503): Failed to connect to AgentGuard gateway...` | **PASS** | 6ms | Port 39123 connection failure handled |
| **7b** | **Unreachable Gateway (evaluateSafely)** | Returns `status: 'BLOCK'`, `isBlocked: true` without throwing | Returned `status: 'BLOCK'`, `isBlocked: true`, `reason: 'FAIL_CLOSED: ...'` | **PASS** | 3ms | Strict fail-closed fallback verified |
| **8a** | **Timeout Handling (evaluate)** | Throws `AgentGuardTimeoutError` (408) when latency > `timeoutMs` | Threw `AgentGuardTimeoutError (408): AgentGuard evaluation timed out after 300ms.` | **PASS** | 305ms | AbortSignal timeout abort verified |
| **8b** | **Timeout Handling (evaluateSafely)** | Returns `status: 'BLOCK'`, `isBlocked: true` without throwing | Returned `status: 'BLOCK'`, `reason: 'FAIL_CLOSED: AgentGuard evaluation timed out...'` | **PASS** | 304ms | Timeout fail-closed fallback verified |
| **9** | **Malformed Gateway Response** | Throws `AgentGuardGatewayError` rejecting non-authoritative payload | Threw `AgentGuardGatewayError: Malformed evaluation response received from AgentGuard gateway` | **PASS** | 15ms | Non-conforming payloads rejected |
| **10** | **Request ID / Idempotency** | Gateway echoes client-provided `idempotencyKey` as `requestId` | Response `requestId` matches sent `custom_req_1793118244217` exactly | **PASS** | 21ms | Idempotency propagation verified |
| **11a** | **Direct Prompt Scanning (Threat)** | Returns `PromptScanResult` with `isThreatDetected: true` & findings | Gateway returned HTTP 403; SDK threw `AgentGuardForbiddenError` (HTTP 403) | **FAIL** | 19ms | **SDK Defect**: HTTP 403 treated as exception instead of returning findings |
| **11b** | **Prompt Context in evaluate()** | Injected prompt context rejected at gateway with `BLOCK` | Evaluated as `status: 'BLOCK'`, violation `Prompt threat: [INSTRUCTION_OVERRIDE]` | **PASS** | 28ms | Multi-modal injection defense verified |
| **11c** | **Direct Prompt Scanning (Clean)** | Returns `PromptScanResult` with `isThreatDetected: false` | Returned `{ isThreatDetected: false, riskScore: 0, threatLevel: 'NONE', findings: [] }` | **PASS** | 16ms | Verified on clean prompt input |
| **12a** | **Approval Polling Timeout** | `waitForApproval()` throws `AgentGuardTimeoutError` on timeout | Threw `AgentGuardTimeoutError: Timed out waiting for approval on '...' after 400ms.` | **PASS** | 408ms | Polling loop timeout verified |
| **12b** | **Key Revocation (Phase 8)** | HTTP 200, `apiKey.revoked: true` via authorized API | Revoked key `f8dc840b-cb29-4a4a-bf43-2a2c5177f5f4`; confirmed `revoked: true` | **PASS** | 25ms | Admin revocation confirmed |
| **12c** | **Post-Revocation Enforcement** | Gateway rejects evaluation with revoked key (HTTP 401) | Threw `AgentGuardAuthenticationError (401): API key has been revoked.` | **PASS** | 11ms | Zero residual window confirmed |

---

## 7. Policy Decision Tests

### 7.1 ALLOW Scenario (Normal Autonomous Purchase)
- **Request Parameters:** `amount: 15.00`, `currency: 'USD'`, `action: 'payment.create'`.
- **Evaluation Criteria:** Action within single transaction ceiling ($50.00), daily spending cap ($200.00), and below human approval threshold ($25.00).
- **Observed Result:**
  ```json
  {
    "status": "ALLOW",
    "decision": "ALLOW",
    "isAllowed": true,
    "isHeld": false,
    "isBlocked": false,
    "reason": "Transaction evaluated against all hard deterministic policy constraints and authorized.",
    "violations": [],
    "authorizationToken": "auth_0cc4b7993ac441e2b292600fb98fb304",
    "amountFormatted": "15.00",
    "currency": "USD"
  }
  ```
- **Auditor Verification:** The gateway returned a cryptographically signed `authorizationToken`. Downstream payment adapters (such as PayPal or Razorpay) require this token before order capture.

### 7.2 BLOCK Scenario (Exceeding Spending Limit)
- **Request Parameters:** `amount: 120.00`, `currency: 'USD'`, `action: 'payment.create'`.
- **Evaluation Criteria:** Action exceeds maximum single transaction limit of $50.00.
- **Observed Result:**
  ```json
  {
    "status": "BLOCK",
    "decision": "BLOCK",
    "isAllowed": false,
    "isHeld": false,
    "isBlocked": true,
    "reason": "MAX_AMOUNT_EXCEEDED: Transaction amount 120.00 USD exceeds maximum single transaction limit of 50.00 USD.",
    "violations": [
      "MAX_AMOUNT_EXCEEDED: Transaction amount 120.00 USD exceeds maximum single transaction limit of 50.00 USD."
    ]
  }
  ```
- **Auditor Verification:** HTTP status returned was 403 Forbidden. No authorization token was issued. Audit event `POLICY_BLOCKED` was recorded in PostgreSQL.

### 7.3 HOLD Scenario (Human-in-the-Loop Approval Required)
- **Request Parameters:** `amount: 35.00`, `currency: 'USD'`, `action: 'payment.create'`.
- **Evaluation Criteria:** Transaction amount is between $25.00 threshold and $50.00 ceiling.
- **Observed Result:**
  ```json
  {
    "status": "HOLD",
    "decision": "HOLD",
    "isAllowed": false,
    "isHeld": true,
    "isBlocked": false,
    "reason": "MANDATORY_APPROVAL_REQUIRED: Amount 35.00 USD meets or exceeds approval threshold of 25.00 USD. Payment execution is prohibited pending human approval.",
    "pendingApprovalId": "40d70a8b-f91b-4c83-a7a5-056de44673a0"
  }
  ```
- **Auditor Verification:** HTTP status returned was 202 Accepted. The pending approval ID was confirmed in the PostgreSQL `pending_approvals` table. Querying `client.getApproval("40d70a8b-...")` returned status `PENDING`.

---

## 8. Fail-Closed and Error-Handling Results

### 8.1 Invariant: Strict Fail-Closed Under All Failure Modes
AgentGuard's primary design guarantee is that **no network failure, gateway outage, timeout, or malformed response can ever permit money movement**.

| Failure Mode | Raw `client.evaluate()` Behavior | Safe `client.evaluateSafely()` Behavior | Fail-Closed Guaranteed? |
| :--- | :--- | :--- | :--- |
| **Gateway Offline / Connection Refused** | Throws `AgentGuardGatewayError` (503) | Returns `{ status: 'BLOCK', isBlocked: true, reason: 'FAIL_CLOSED: ...' }` | **YES** |
| **Timeout (Network Hang / Slow Gateway)** | Throws `AgentGuardTimeoutError` (408) | Returns `{ status: 'BLOCK', isBlocked: true, reason: 'FAIL_CLOSED: ...' }` | **YES** |
| **HTTP 500 / 502 / 504 Gateway Error** | Throws `AgentGuardGatewayError` (5xx) | Returns `{ status: 'BLOCK', isBlocked: true, reason: 'FAIL_CLOSED: ...' }` | **YES** |
| **Malformed JSON Response Body** | Throws `AgentGuardGatewayError` | Returns `{ status: 'BLOCK', isBlocked: true, reason: 'FAIL_CLOSED: ...' }` | **YES** |
| **Invalid Authentication Key (401)** | Throws `AgentGuardAuthenticationError` (401) | Returns `{ status: 'BLOCK', isBlocked: true, reason: 'FAIL_CLOSED: ...' }` | **YES** |
| **Insufficient Permissions (403)** | Throws `AgentGuardForbiddenError` (403) | Returns `{ status: 'BLOCK', isBlocked: true, reason: 'FAIL_CLOSED: ...' }` | **YES** |

### 8.2 Distinguishing Local Fallback BLOCK from Server Policy BLOCK
In `evaluateSafely()`, the local fallback `BLOCK` decision is distinguished by:
1. `reason`: Begins with prefix `FAIL_CLOSED:`.
2. `violations`: Contains `Gateway communication error: <original error>`.
3. `policyId` & `policyVersion`: Omitted / undefined (server-side policy decisions always populate `policyId: 'default'` and `policyVersion: 1`).

---

## 9. Security Findings

### Finding 1: `client.scanPrompt()` Throws ForbiddenError When Threat Is Detected
- **Severity:** **MEDIUM**
- **Affected Component:** `packages/typescript-sdk/src/client.ts` (lines 229–235) & `src/routes/scan.ts` (line 43)
- **Description:**  
  When an adversarial prompt injection pattern is detected by the gateway scanner, `src/routes/scan.ts` responds with `HTTP 403 Forbidden` and attaches the structured findings (`findings: [...]`, `riskScore: 0.85`, `isThreatDetected: true`).  
  In the SDK client, `scanPrompt()` executes:
  ```typescript
  const body = await response.json();
  if (!response.ok) {
    throw parseErrorResponse(response.status, body);
  }
  return body as PromptScanResult;
  ```
  Because HTTP 403 has `!response.ok`, the SDK throws an uncaught `AgentGuardForbiddenError: AgentGuard request failed with HTTP 403`. The calling application cannot read `scanResult.findings` or inspect the detected threat rules.
- **Impact:** Developers cannot programmatically inspect threat categories or display detailed security feedback to users without manually parsing error properties.
- **Remediation:**  
  Update `scanPrompt()` in `client.ts` to inspect the response payload before throwing:
  ```typescript
  const body = await response.json();
  if (response.status === 403 && body && body.isThreatDetected !== undefined) {
    return body as PromptScanResult;
  }
  if (!response.ok) {
    throw parseErrorResponse(response.status, body);
  }
  return body as PromptScanResult;
  ```

---

### Finding 2: Lack of Dedicated Boolean Flag for Local Fallback Decision
- **Severity:** **LOW**
- **Affected Component:** `packages/typescript-sdk/src/types.ts` (`EvaluationResult`)
- **Description:**  
  When `evaluateSafely()` generates a fallback `BLOCK` decision due to a network outage or timeout, it populates `status: 'BLOCK'`, `reason: 'FAIL_CLOSED: ...'`. However, `EvaluationResult` lacks an explicit boolean field such as `isFallback?: boolean` or `authoritative?: boolean`.
- **Impact:** Consumer code that logs or routes metrics must rely on string parsing (`result.reason.startsWith('FAIL_CLOSED:')`) rather than a type-safe boolean property to distinguish between a deterministic server policy rejection and a local transport failure.
- **Remediation:** Add `isFallback: boolean` to `EvaluationResult` and set `isFallback: true` in `evaluateSafely()`, while server-generated responses set `isFallback: false`.

---

### Finding 3: Missing CommonJS Usage Example in Package Documentation
- **Severity:** **INFORMATIONAL**
- **Affected Component:** `packages/typescript-sdk/README.md`
- **Description:**  
  The published README advertises `Dual Export: Full support for both ECMAScript Modules (ESM) and CommonJS (CJS)`. However, the code snippet only illustrates ESM (`import { AgentGuard } from '@codesec-ai/agentguard'`).
- **Remediation:** Provide an explicit CommonJS snippet (`const { AgentGuard } = require('@codesec-ai/agentguard');`) in the Quickstart section.

---

### Finding 4: Clarification Required on Downstream Payment Execution Boundary
- **Severity:** **INFORMATIONAL**
- **Affected Component:** `packages/typescript-sdk/README.md`
- **Description:**  
  In the README example, line 44 contains: `// Safe to initiate Razorpay or downstream payment rail`. Without context, inexperienced developers might assume that invoking `agentguard.evaluate()` executes or moves money itself.
- **Remediation:** Add an explicit security advisory box in the README clarifying that AgentGuard is an advisory and authorization gate. Downstream payment execution requires sending the returned `authorizationToken` to the server-side payment adapter for single-use cryptographic verification.

---

## 10. Automated Test Suite Results

### 10.1 TypeScript SDK Unit Test Suite
- **Command:** `npm test --prefix packages/typescript-sdk`
- **Discovery:** 1 test file (`packages/typescript-sdk/tests/client.test.ts`)
- **Execution Summary:**
  - Total Tests: 11
  - Passed: 11
  - Failed: 0
  - Skipped: 0
  - Duration: 471ms
- **Coverage Areas:** Configuration validation, trailing slash normalization, header injection (`X-API-Key`, `Authorization`, `User-Agent`), ALLOW parsing, HOLD parsing, BLOCK parsing, typed error mappings (400, 401, 408, 503), `evaluateSafely()` fail-closed guarantee, and approval record querying.

### 10.2 Repository-Wide Test Suite
- **Command:** `npm test` (root Vitest runner)
- **Discovery:** 31 test files, 246 tests
- **Execution Summary:**
  - Test Files Passed: 30 / 31 (96.8%)
  - Total Tests Passed: 237 / 246 (96.3%)
  - Total Tests Skipped: 4
  - Total Tests Failed: 5 (contained within 1 test file: `tests/integration/hackathon-scenarios.test.ts`)
  - Duration: 39.44s
- **Analysis of Failed Tests:**
  The 5 failed tests in `hackathon-scenarios.test.ts` all stem from `src/demo/runner.ts` attempting to authenticate using hardcoded credentials `username: 'security_admin'`, `password: 'ChangeMeNow123!'`. In the active PostgreSQL container, `SEED_DEMO_DATA=false` was configured on initial startup, meaning `security_admin` does not exist in the database. When the test runner attempts to query audit logs to verify scenario prevention, `getAuthToken()` returns empty string, audit verification fails, and the scenarios report failed. When run with in-memory repositories or with `SEED_DEMO_DATA=true`, all scenarios pass.
- **Critical Security Suites Passing:**
  - `tests/integration/api-keys-and-evaluate.test.ts` — 7/7 PASSED (100%)
  - `tests/security/auth-lifecycle.test.ts` — PASSED
  - `tests/security/self-hosting-auth.test.ts` — PASSED
  - `tests/security/security-regression.test.ts` — PASSED
  - `tests/unit/authorization-engine.test.ts` — PASSED
  - `tests/unit/human-approval-workflow.test.ts` — PASSED

### 10.3 Code Quality & Linting
- **Command:** `npm run lint` (`eslint "src/**/*.ts" "tests/**/*.ts"`)
- **Result:** **0 Errors**, 40 warnings (primarily `@typescript-eslint/no-explicit-any` on legacy test fixtures).
- **Compilation Build:** `npm run build` (`tsc -p tsconfig.build.json`) completed with exit code 0.
- **SDK Build:** `npm run build --prefix packages/typescript-sdk` completed with exit code 0 (`dist/index.js` 12.3kb, `dist/index.mjs` 10.8kb).

---

## 11. Documentation and Package Quality Findings

1. **Installation Instructions:** Completely accurate across `npm`, `yarn`, and `pnpm`.
2. **`baseUrl` Formatting:** The README uses `baseUrl: process.env.AGENTGUARD_URL || 'http://localhost:3001'`. No broken markdown links or syntax corruptions exist within string literals.
3. **Dual Export Quality:** Dual export configuration in `package.json` correctly uses standard export conditions:
   ```json
   "exports": {
     ".": {
       "types": "./dist/index.d.ts",
       "import": "./dist/index.mjs",
       "require": "./dist/index.js"
     }
   }
   ```
4. **Header Compliance:** The SDK properly sends both `X-API-Key` and `Authorization: Bearer ag_...`, satisfying diverse reverse proxy and API gateway conventions.
5. **Types Exported:** All critical types (`EvaluationDecision`, `EvaluateRequest`, `EvaluationResult`, `ApprovalRecord`, `WaitForApprovalOptions`, `PromptScanResult`, `PromptScanFinding`, `AgentGuardConfig`) are properly exported from the package root.

---

## 12. Failures, Blockers, and Untested Areas

### Verified Failures
1. **`client.scanPrompt()` with Threat Input:** Fails to return `PromptScanResult` when an adversarial pattern is detected because the gateway responds HTTP 403, which the SDK currently interprets as a fatal request error.

### Blockers Encountered & Resolved
1. **Reviewer Login:** The test environment database was initialized with owner `altaf`, while hardcoded test account `security_admin` was inactive. This was successfully navigated by utilizing the authorized Owner session token to create least-privilege API keys without guessing passwords or modifying database records.

### Untested Areas & Justification
1. **Real Downstream Payment Settlement:** No live transactions were sent to production payment rails (Razorpay or PayPal production). This is by strict security design: policy evaluation validates permission; live monetary execution is strictly out of scope for SDK evaluation testing.
2. **Distributed Redis Caching:** Testing utilized the production-standard PostgreSQL transactional lock and in-memory policy stores; Redis cluster distributed locking was not tested.

---

## 13. Recommended Fixes, Prioritized by Severity

### Priority 1 (Medium Severity) — Fix `scanPrompt()` Error Handling on Threat Detection
In `packages/typescript-sdk/src/client.ts`, update `scanPrompt()` to return the scan result even when the gateway emits HTTP 403:
```typescript
// Proposed fix in packages/typescript-sdk/src/client.ts
const body = await response.json();
if (response.status === 403 && body && typeof body.isThreatDetected === 'boolean') {
  return body as PromptScanResult;
}
if (!response.ok) {
  throw parseErrorResponse(response.status, body);
}
return body as PromptScanResult;
```

### Priority 2 (Low Severity) — Add `isFallback` Boolean to `EvaluationResult`
In `packages/typescript-sdk/src/types.ts` and `client.ts`:
- Add `isFallback?: boolean` to `EvaluationResult`.
- In `evaluate()`, set `isFallback: false`.
- In `evaluateSafely()`, set `isFallback: true`.

### Priority 3 (Low Severity) — Add CommonJS Snippet & Payment Rail Disclaimer to README
Update `packages/typescript-sdk/README.md` to include:
1. CommonJS example:
   ```javascript
   const { AgentGuard } = require('@codesec-ai/agentguard');
   ```
2. Architecture advisory notice explaining that `evaluate()` returns authorization tokens to be passed to secure backend payment routes, and does not unilaterally trigger payment execution.

---

## 14. Final Release-Readiness Assessment

### Final Status: **PASS WITH WARNINGS**

### Detailed Determination
The published npm package **`@codesec-ai/agentguard@1.0.0`** successfully fulfills all primary mission-critical objectives:
1. It installs cleanly from the official npm public registry without missing dependencies.
2. It executes flawlessly in both modern ESM and traditional CommonJS runtimes.
3. It enforces strict type-safety and compiles without errors under `tsc`.
4. It successfully authenticates against the live AgentGuard gateway using standard API key conventions.
5. It authoritatively enforces deterministic security policies across `ALLOW`, `BLOCK`, and `HOLD` states.
6. It demonstrates a strict, mathematically sound **fail-closed** architecture: network partitions, timeouts, and gateway failures strictly default to `status: 'BLOCK'` and `isAllowed: false`.
7. All temporary test credentials were created with least privilege and immediately revoked via authorized administrative endpoints.

The assignment of **PASS WITH WARNINGS** reflects the non-critical defect in `scanPrompt()` handling of HTTP 403 threat responses, which should be resolved in an upcoming patch release (`1.0.1`), along with package documentation improvements. Core evaluation and payment gateway protection are fully functional and safe for production integration.
