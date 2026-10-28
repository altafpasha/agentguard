# AgentGuard + Razorpay Merchant Integration Example

This directory contains a complete, practical reference implementation showing how an external merchant backend integrates **AgentGuard** to evaluate AI agent transactions before executing downstream **Razorpay** operations.

---

## Architecture & Flow

```
                                      +------------------------+
                                      |   Customer / AI Agent  |
                                      +------------------------+
                                                  |
                                                  | 1. Request Payment (amount, currency)
                                                  v
                                      +------------------------+
                                      |    Merchant Backend    |
                                      +------------------------+
                                                  |
                                                  | 2. Pre-flight Policy Evaluation
                                                  v
                                      +------------------------+
                                      |    AgentGuard Gateway  |
                                      | (Deterministic Policy) |
                                      +------------------------+
                                                  |
                                                  | 3. Decision (ALLOW / HOLD / BLOCK)
                                                  v
                                      +------------------------+
                                      |    Merchant Backend    |
                                      +------------------------+
                                         /        |        \
                             ALLOW      /   HOLD  |  BLOCK  \
                                       v          v          v
                       +----------------+   +----------+   +-------------------+
                       | Call Razorpay  |   | Queue for|   | Reject Request    |
                       | Order Creation |   | Reviewer |   | (No Razorpay call)|
                       +----------------+   +----------+   +-------------------+
                               |
                               | 4. Order Created
                               v
                       +----------------+
                       | Customer Pays  |
                       +----------------+
                               |
                               | 5. Payment Signature (HMAC-SHA256)
                               v
                       +----------------+
                       | Merchant Backend| (Cryptographic Verification)
                       | Marks as PAID  |
                       +----------------+
```

---

## Security Guarantees Demonstrated

1. **Strict Fail-Closed Enforcement**: If AgentGuard is unreachable, times out, or returns a 5xx error, the client returns `BLOCK`. Downstream payment operations are NEVER attempted on unknown status.
2. **Credential Isolation**: Razorpay Key Secret and AgentGuard keys live solely on the merchant backend—never bundled into browser JavaScript.
3. **Defense Against Client Tampering**: Payment amounts and currencies are authoritatively verified against AgentGuard policies on the backend.
4. **Cryptographic Verification**: Payment completion requires verifying `razorpay_order_id|razorpay_payment_id` against `RAZORPAY_KEY_SECRET` using `crypto.timingSafeEqual`.
5. **Separation of Authorization and Execution**: An `ALLOW` decision from AgentGuard grants authorization to create an order; only cryptographic signature verification or a signed webhook marks the order as `PAID`.

---

## Prerequisites

1. Running AgentGuard Gateway (port 3001 locally or in Docker):
   ```bash
   docker compose up -d
   ```
2. Node.js 18+ or 20+.

---

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your environment variables:
```ini
PORT=4000
AGENTGUARD_BASE_URL=http://localhost:3001
AGENTGUARD_TIMEOUT_MS=3000

# Razorpay Test Credentials (Leave as placeholder to run in simulation mode)
RAZORPAY_KEY_ID=rzp_test_placeholder_key_id
RAZORPAY_KEY_SECRET=placeholder_secret_key_secret
RAZORPAY_WEBHOOK_SECRET=placeholder_webhook_secret_key
```

---

## Running the Merchant Application

Install dependencies:
```bash
npm install
```

Start the merchant server:
```bash
npm start
```

---

## Testing Scenarios

### 1. Allowed Transaction (Within Limit)
```bash
curl -X POST http://localhost:4000/api/checkout/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "travel-booking-agent",
    "amount": 25.00,
    "currency": "INR",
    "customerEmail": "user@example.com"
  }'
```
**Expected Response:** HTTP 201 Created with `status: "CREATED"`, `decision: "ALLOW"`, and `orderId`.

### 2. Blocked Transaction (Exceeds Limit)
```bash
curl -X POST http://localhost:4000/api/checkout/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "travel-booking-agent",
    "amount": 50000.00,
    "currency": "INR",
    "customerEmail": "user@example.com"
  }'
```
**Expected Response:** HTTP 403 Forbidden with `status: "BLOCKED"` and `reason: "MAX_AMOUNT_EXCEEDED"`. Razorpay is NOT called.

### 3. Payment Signature Verification
```bash
curl -X POST http://localhost:4000/api/checkout/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "<order_id_from_step_1>",
    "paymentId": "pay_test_12345",
    "signature": "sim_sig_<order_id_from_step_1>"
  }'
```
**Expected Response:** HTTP 200 OK with `verified: true` and `status: "PAID"`.
