import http from 'http';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { AgentGuardClient } from './agentguard-client';

const PORT = parseInt(process.env.PORT || '4000', 10);
const AGENTGUARD_BASE_URL = process.env.AGENTGUARD_BASE_URL || 'http://localhost:3001';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder_webhook_secret';

// Initialize AgentGuard client with strict 3-second timeout and fail-closed security
const agentGuard = new AgentGuardClient({
  baseUrl: AGENTGUARD_BASE_URL,
  apiKey: process.env.AGENTGUARD_API_KEY,
  timeoutMs: 3000,
});

// Initialize official Razorpay SDK client (or mock in test/demo mode)
const isConfigured = !RAZORPAY_KEY_ID.includes('placeholder') && !RAZORPAY_KEY_SECRET.includes('placeholder');
const razorpay = isConfigured
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

// Ephemeral merchant order database
interface MerchantOrder {
  orderId: string;
  amount: number;
  currency: string;
  status: 'PENDING_EVALUATION' | 'HELD_PENDING_APPROVAL' | 'BLOCKED' | 'CREATED' | 'PAID' | 'FAILED';
  agentGuardDecisionId?: string;
  authorizationToken?: string;
  paymentId?: string;
  createdAt: string;
  paidAt?: string;
}

const ordersDb = new Map<string, MerchantOrder>();

// Helper to parse JSON body
async function parseBody(req: http.IncomingMessage): Promise<{ raw: string; json: any }> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 512) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        resolve({ raw: body, json });
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Razorpay-Signature');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Health check
  if (method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, {
      status: 'healthy',
      service: 'razorpay-sample-merchant',
      agentGuardUrl: AGENTGUARD_BASE_URL,
      razorpayConfigured: isConfigured,
      activeOrders: ordersDb.size,
    });
  }

  /**
   * STEP 1 & 2: Customer payment request -> Merchant validates -> AgentGuard evaluates -> Razorpay called only if ALLOW
   * POST /api/checkout/create-order
   */
  if (method === 'POST' && pathname === '/api/checkout/create-order') {
    try {
      const { json } = await parseBody(req);
      const { agentId, amount, currency = 'INR', customerEmail, receipt } = json;

      // 1. Merchant Backend Validation
      if (!agentId || !amount) {
        return sendJson(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'agentId and positive amount are required.',
        });
      }

      const numericAmount = Number(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return sendJson(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'Amount must be a positive number.',
        });
      }

      const normalizedCurrency = currency.toUpperCase();
      console.log(`[Merchant] Processing order request: ${numericAmount} ${normalizedCurrency} for agent: ${agentId}`);

      // 2. Authoritative AgentGuard Policy Pre-Flight Evaluation
      console.log(`[Merchant] Requesting AgentGuard policy evaluation...`);
      const evaluation = await agentGuard.evaluatePayment({
        agentId,
        amount: numericAmount,
        currency: normalizedCurrency,
        merchant: customerEmail || 'merchant@agentguard.internal',
        tool: 'razorpay_payment',
        operation: 'create_razorpay_order',
        metadata: { receipt },
      });

      console.log(`[Merchant] AgentGuard decision: ${evaluation.decision} (${evaluation.reason || 'No violation'})`);

      // 3. Handle Decision: BLOCK
      if (evaluation.decision === 'BLOCK') {
        const orderId = `ord_blocked_${Date.now()}`;
        ordersDb.set(orderId, {
          orderId,
          amount: numericAmount,
          currency: normalizedCurrency,
          status: 'BLOCKED',
          agentGuardDecisionId: evaluation.decisionId,
          createdAt: new Date().toISOString(),
        });

        return sendJson(res, 403, {
          success: false,
          status: 'BLOCKED',
          decision: 'BLOCK',
          reason: evaluation.reason || 'Payment rejected by AgentGuard policy rules.',
          violations: evaluation.violations,
          decisionId: evaluation.decisionId,
          failClosedTriggered: evaluation.failClosedTriggered,
          message: 'Payment execution halted. Downstream Razorpay API was NOT called.',
        });
      }

      // 4. Handle Decision: HOLD (Human-in-the-Loop Approval Required)
      if (evaluation.decision === 'HOLD') {
        const orderId = `ord_held_${Date.now()}`;
        ordersDb.set(orderId, {
          orderId,
          amount: numericAmount,
          currency: normalizedCurrency,
          status: 'HELD_PENDING_APPROVAL',
          agentGuardDecisionId: evaluation.decisionId,
          createdAt: new Date().toISOString(),
        });

        return sendJson(res, 202, {
          success: false,
          status: 'PENDING_APPROVAL',
          decision: 'HOLD',
          pendingApprovalId: evaluation.pendingApprovalId,
          reason: evaluation.reason || 'Payment exceeds review threshold. Human approval required.',
          message: 'Payment execution is paused pending human reviewer approval in AgentGuard. Razorpay order not yet created.',
        });
      }

      // 5. Decision is ALLOW: Safely create order on Razorpay
      let razorpayOrderId: string;
      const amountPaise = Math.round(numericAmount * 100);

      if (razorpay) {
        // Real Razorpay API call
        const rzpOrder = await razorpay.orders.create({
          amount: amountPaise,
          currency: normalizedCurrency,
          receipt: receipt || `rcpt_${Date.now()}`,
          notes: {
            agentguard_decision_id: evaluation.decisionId,
            agent_id: agentId,
          },
        });
        razorpayOrderId = rzpOrder.id;
      } else {
        // Safe simulation fallback when credentials are test placeholders
        razorpayOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      // 6. Record Authorized Order in Merchant Database
      ordersDb.set(razorpayOrderId, {
        orderId: razorpayOrderId,
        amount: numericAmount,
        currency: normalizedCurrency,
        status: 'CREATED',
        agentGuardDecisionId: evaluation.decisionId,
        authorizationToken: evaluation.authorizationToken,
        createdAt: new Date().toISOString(),
      });

      console.log(`[Merchant] Successfully created Razorpay order: ${razorpayOrderId}`);

      return sendJson(res, 201, {
        success: true,
        status: 'CREATED',
        decision: 'ALLOW',
        orderId: razorpayOrderId,
        amount: numericAmount,
        currency: normalizedCurrency,
        agentGuardDecisionId: evaluation.decisionId,
        authorizationToken: evaluation.authorizationToken,
        isSimulated: !isConfigured,
      });
    } catch (err: any) {
      console.error(`[Merchant] Checkout error:`, err);
      return sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: err.message || 'Failed to process checkout',
      });
    }
  }

  /**
   * STEP 3: Cryptographic Signature Verification on Payment Completion
   * POST /api/checkout/verify-payment
   */
  if (method === 'POST' && pathname === '/api/checkout/verify-payment') {
    try {
      const { json } = await parseBody(req);
      const { orderId, paymentId, signature } = json;

      if (!orderId || !paymentId || !signature) {
        return sendJson(res, 400, {
          error: 'VALIDATION_ERROR',
          message: 'orderId, paymentId, and signature are required.',
        });
      }

      const order = ordersDb.get(orderId);
      if (!order) {
        return sendJson(res, 404, {
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} does not exist in merchant database.`,
        });
      }

      // Verify HMAC-SHA256 signature
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      let isValid = false;
      try {
        isValid = crypto.timingSafeEqual(
          Buffer.from(signature, 'utf8'),
          Buffer.from(expectedSignature, 'utf8')
        );
      } catch {
        isValid = false;
      }

      // Allow simulated test signatures when running in mock mode
      if (!isConfigured && signature === `sim_sig_${orderId}`) {
        isValid = true;
      }

      if (!isValid) {
        console.warn(`[Merchant] Signature verification FAILED for order ${orderId}`);
        return sendJson(res, 400, {
          success: false,
          verified: false,
          error: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'Payment signature mismatch. Transaction marked suspicious and rejected.',
        });
      }

      // Mark order as paid
      order.status = 'PAID';
      order.paymentId = paymentId;
      order.paidAt = new Date().toISOString();
      ordersDb.set(orderId, order);

      console.log(`[Merchant] Payment confirmed & verified for order ${orderId}`);

      return sendJson(res, 200, {
        success: true,
        verified: true,
        orderId,
        paymentId,
        status: 'PAID',
        paidAt: order.paidAt,
        message: 'Payment signature verified. Order successfully marked as paid.',
      });
    } catch (err: any) {
      return sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: err.message,
      });
    }
  }

  /**
   * STEP 4: Razorpay Webhook with HMAC Signature Verification & Idempotency
   * POST /api/webhooks/razorpay
   */
  if (method === 'POST' && pathname === '/api/webhooks/razorpay') {
    try {
      const { raw, json } = await parseBody(req);
      const signature = (req.headers['x-razorpay-signature'] as string) || '';

      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(raw)
        .digest('hex');

      let isSigValid = false;
      try {
        isSigValid = crypto.timingSafeEqual(
          Buffer.from(signature, 'utf8'),
          Buffer.from(expectedSignature, 'utf8')
        );
      } catch {
        isSigValid = false;
      }

      if (!isSigValid && isConfigured) {
        console.warn(`[Merchant] Webhook signature invalid`);
        return sendJson(res, 400, { error: 'INVALID_WEBHOOK_SIGNATURE' });
      }

      const event = json.event;
      const orderId = json.payload?.payment?.entity?.order_id || json.payload?.order?.entity?.id;

      if (event === 'order.paid' && orderId) {
        const order = ordersDb.get(orderId);
        if (order && order.status !== 'PAID') {
          order.status = 'PAID';
          order.paidAt = new Date().toISOString();
          ordersDb.set(orderId, order);
          console.log(`[Merchant Webhook] Order ${orderId} marked paid idempotently.`);
        }
      }

      return sendJson(res, 200, { received: true, event });
    } catch (err: any) {
      return sendJson(res, 500, { error: 'WEBHOOK_PROCESSING_FAILED', message: err.message });
    }
  }

  // Not found
  return sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Sample Razorpay Merchant Backend running on port ${PORT}`);
  console.log(`AgentGuard Policy Gateway: ${AGENTGUARD_BASE_URL}`);
  console.log(`Razorpay Live Mode: ${isConfigured ? 'ENABLED' : 'SIMULATED TEST MODE'}`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/checkout/create-order   (Guarded Order Creation)`);
  console.log(`  POST /api/checkout/verify-payment  (HMAC Signature Verification)`);
  console.log(`  POST /api/webhooks/razorpay       (Webhook Receiver)`);
  console.log(`======================================================\n`);
});
