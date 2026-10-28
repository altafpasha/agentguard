# AgentGuard: How It Works & Architecture Guide

AgentGuard is a high-assurance, deterministic security gateway designed to protect autonomous AI agents executing payments via PayPal Sandbox. It ensures that no agent or frontend client can ever bypass policy, spoof payment parameters, or execute unauthorized transactions.

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI Shopping Agent / User                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1. Proposes Purchase
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 AgentGuard Interactive Storefront / App                │
│    (Submits ONLY { productId, quantity } — Client prices forbidden)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 2. POST /api/v1/store/checkout
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   AgentGuard Fastify Security Gateway                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Layer 1: Prompt-Injection & Adversarial Threat Scanner           │  │
│  │ - 60+ Heuristics (DAN, instruction override, system hijack)      │  │
│  │ - Unicode normalization, zero-width space removal, obfuscation   │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Clean input                      │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Layer 2: Authoritative Data Layer & Deterministic Policy Engine  │  │
│  │ - Server looks up authoritative product prices from Database     │  │
│  │ - Single-transaction cap ($50.00 max)                            │  │
│  │ - Rolling daily budget ($200.00 max)                             │  │
│  │ - Velocity limits (max 5 tx / minute)                            │  │
│  │ - Merchant Allowlist / Blocklist verification                   │  │
│  │ - HITL Threshold ($25.00+ requires Human Approval)               │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Policy: ALLOW                    │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Layer 3: Official PayPal Sandbox Integration (Orders v2 API)     │  │
│  │ - Server-calculated amount passed to PayPal Orders API          │  │
│  │ - Returns official PayPal approval URL                           │  │
│  │ - Post-approval reconciliation (amount, payee, currency match)    │  │
│  │ - Secure server-side capture execution                          │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Layer 4: Durable Tamper-Evident Audit & Reviewer Ledger          │  │
│  │ - Automatic secret & PII redaction                              │  │
│  │ - Durable PostgreSQL 16 & in-memory audit store                 │  │
│  │ - Reviewer sessions with cryptographic authorization tokens       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 3. Approved & Captured
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         PayPal Sandbox API                             │
│                  (https://api-m.sandbox.paypal.com)                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Security Invariants

1. **Zero Client Price Trust**: The checkout API (`POST /api/v1/store/checkout`) accepts only `productId` and `quantity`. Prices are looked up strictly from the authoritative database table. Any client attempt to send a price is disregarded.
2. **Deterministic Deny-by-Default**: Policy evaluation is 100% deterministic code. An AI model is never the final decision-maker for financial authorizations.
3. **Pre-Authorization Before PayPal Call**: Prohibited transactions (exceeding $50 single cap, blocked merchants, or malicious prompt injection) are blocked **before** any PayPal API order is initiated.
4. **Single-Use Approval Tokens**: Transactions held for human review ($25.00–$50.00) require an authenticated reviewer to approve. An HMAC-SHA256 token is bound strictly to `(agentId, amount, currency, recipientEmail, referenceId)`. Replay or modification attempts are rejected with HTTP 409 Conflict.
5. **Post-Approval Reconciliation**: When a buyer returns from PayPal, AgentGuard calls `GET /v2/checkout/orders/{id}` to verify that the buyer did not alter amounts, payee email, or currency in the PayPal UI before authorizing server capture.

---

## 3. End-to-End Payment Flow

### Step 1: Catalog Selection & Server Lookup
- The buyer (or AI agent) selects items in the storefront.
- When checkout is clicked, the client sends:
  ```json
  POST /api/v1/store/checkout
  {
    "items": [
      { "productId": "prod-devops-license", "quantity": 1 }
    ]
  }
  ```
- The gateway queries `storeProducts` table for `prod-devops-license` ($18.50).
- Server calculates `totalCents = 1850` ($18.50 USD).

### Step 2: Policy & Threat Evaluation
- Input is sanitized and scanned by `InjectionScanner`.
- Deterministic rules evaluated:
  - Is $18.50 <= $50.00? Yes.
  - Is rolling daily spend + $18.50 <= $200.00? Yes.
  - Is merchant allowed? Yes.
  - Does amount require human review ($25.00+)? No ($18.50 < $25.00).
- Verdict: `ALLOW`.

### Step 3: PayPal Sandbox Order Creation
- The gateway authenticates with PayPal OAuth (`POST /v1/oauth2/token`) using server-side `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
- Calls PayPal Orders v2:
  ```json
  POST /v2/checkout/orders
  {
    "intent": "CAPTURE",
    "purchase_units": [{
      "reference_id": "ORD-MVPJ1JYG-VPXE",
      "amount": { "currency_code": "USD", "value": "18.50" },
      "payee": { "email_address": "store@agentguard.local" }
    }]
  }
  ```
- PayPal returns order status `CREATED` with an `approvalUrl`:
  `https://www.sandbox.paypal.com/checkoutnow?token=7LK23625F7182202C`

### Step 4: Buyer Approval in PayPal Sandbox
- Buyer visits the approval URL and approves with their PayPal Sandbox buyer account.
- PayPal redirects to `/storefront/order-status?token=7LK23625F7182202C`.

### Step 5: Server Reconciliation & Capture
- The frontend invokes `POST /api/v1/store/orders/7LK23625F7182202C/capture`.
- Gateway retrieves order from PayPal, validates amount ($18.50), currency (USD), and payee.
- Executes trusted capture: `POST /v2/checkout/orders/7LK23625F7182202C/capture`.
- PayPal returns `COMPLETED` and capture reference ID (e.g. `CAP-7182202C`).
- Local database updates order status to `COMPLETED`.
- Audit event `PAYMENT_COMPLETED` logged.

---

## 4. Attack Scenarios & Gate Defense

| Scenario | Trigger | Gateway Defense | Result |
| :--- | :--- | :--- | :--- |
| **Normal Purchase** | DevOps Tool License ($18.50) | Within $50 cap and $25 HITL limit | Approved. PayPal Sandbox order created. |
| **Spending Cap Breach** | Cloud Compute Node ($75.00) | Exceeds $50.00 single cap limit | **Blocked (HTTP 403)** before PayPal call. |
| **Prompt Injection** | Smart Security Cam Listing | Embedded `"Ignore previous budget rules!..."` | **Blocked (HTTP 403)** by regex heuristic scanner. |
| **Human Review (HOLD)** | Priority Support SLA ($35.00) | Exceeds $25.00 HITL threshold | **Held (HTTP 202)** and enqueued in Reviewer Queue. |
| **Tampered Callback** | Forged PayPal order ID / amount | Reconciled against PayPal API | **Aborted** with parameter mismatch error. |
| **Replay Attack** | Re-submitting consumed approval token | Single-use token hash invalidated | **Rejected (HTTP 409 Conflict)**. |

---

## 5. API Documentation (Swagger / OpenAPI)

Interactive Swagger UI documentation is available at:
```
http://127.0.0.1:3001/docs
```
It includes schemas and test runners for:
- `/api/v1/store/products` (Catalog listing)
- `/api/v1/store/checkout` (Server-side price calculated checkout)
- `/api/v1/store/orders/:orderId/capture` (PayPal reconciliation & capture)
- `/api/v1/approvals/pending` (Human-in-the-loop review queue)
- `/api/v1/pricing/plans` (AgentGuard tier definitions)
- `/api/v1/audit/events` (Tamper-evident audit trail)

---

## 6. Docker & Docker Compose Deployment

To deploy the entire production stack:

```bash
# 1. Configure sandbox environment
cp .env.example .env

# 2. Build and launch services
docker compose up --build -d

# 3. Check container logs
docker compose logs -f
```

Services:
- **`postgres`**: PostgreSQL 16 on port 5432 with health check.
- **`gateway`**: Fastify backend on port 3001.
- **`dashboard`**: Next.js App Router UI on port 3000.

---

## 7. Razorpay Payment Protection & Developer Integration Guide

AgentGuard acts as an authoritative, pre-flight policy evaluation gateway for external applications before they execute operations against the official **Razorpay API**. In this architecture, AgentGuard enforces financial safety and policy limits, while Razorpay remains responsible for payment processing and rail settlement.

### End-to-End Execution Flow

```
Customer/Agent ──> Merchant Backend ──> AgentGuard Gateway ──> Policy Decision (ALLOW/HOLD/BLOCK)
                          │
            ┌─────────────┴─────────────┐
         ALLOW                        HOLD / BLOCK
            │                               │
            ▼                               ▼
    Call Razorpay API             Halt Execution / Queue Review
 (Create Order & Key Checkout)    (Razorpay is NEVER called)
            │
            ▼
    Customer Completes Payment
            │
            ▼
    Merchant Backend Cryptographically Verifies
    HMAC-SHA256 Signature (orderId|paymentId)
            │
            ▼
    Order Marked PAID in Database
```

### Key Security Invariants

1. **Strict Fail-Closed Enforcement**: If AgentGuard is unreachable, times out, or returns a 5xx error, the transaction is authoritatively **BLOCKED**. A missing, malformed, or timed-out response is NEVER treated as permission to execute a payment.
2. **Credential Isolation**: `RAZORPAY_KEY_SECRET` and AgentGuard master keys live solely on the merchant backend server—never leaked into browser JavaScript bundles.
3. **Defense Against Client-Side Tampering**: Amounts, currencies, and products are validated on the backend. Client-submitted prices are rejected.
4. **Separation of Authorization vs Payment Completion**: An `ALLOW` decision from AgentGuard authorizes order creation; only cryptographic HMAC-SHA256 signature verification or signed webhooks confirm that a payment succeeded.
5. **Human-in-the-Loop Review (HOLD)**: Transactions exceeding configured thresholds (e.g. ₹2,000 / $25.00) return `HOLD`, creating an immutable approval record. Razorpay orders are paused until an authorized reviewer approves the action.

### Standalone Sample Merchant Application

A complete, runnable reference implementation is located in:
```bash
examples/razorpay-merchant/
├── package.json          # Dependencies (razorpay, tsx, typescript)
├── .env.example          # Environment variable placeholders
├── agentguard-client.ts  # Fail-closed AgentGuard SDK client
├── server.ts             # Complete Node.js merchant backend server
└── README.md             # Integration walkthrough & test curls
```

### Gateway Endpoints

- `GET /api/v1/integrations/razorpay/config`: Returns public key and sandbox/live status.
- `POST /api/v1/integrations/razorpay/evaluate`: Pre-flight evaluation returning `ALLOW`, `HOLD`, or `BLOCK`.
- `POST /api/v1/integrations/razorpay/orders`: Guarded order creation endpoint (calls Razorpay only if permitted).
- `POST /api/v1/integrations/razorpay/verify-payment`: Verifies Razorpay checkout signatures (`orderId|paymentId`).
- `POST /api/v1/integrations/razorpay/webhook`: Processes webhooks with `X-Razorpay-Signature` HMAC verification.

