import http from 'node:http';
import * as crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { AgentGuard } from '@codesec-ai/agentguard';

const PORT = parseInt(process.env.PORT || '4000', 10);
const AGENTGUARD_URL = process.env.AGENTGUARD_URL || 'http://localhost:3001';
const AGENTGUARD_API_KEY = process.env.AGENTGUARD_API_KEY || 'ag_live_demo_merchant_key';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder_webhook_secret';

// 1. Initialize official AgentGuard SDK client with strict 5-second timeout
const agentguard = new AgentGuard({
  baseUrl: AGENTGUARD_URL,
  apiKey: AGENTGUARD_API_KEY,
  timeoutMs: 5000,
});

// 2. Initialize Razorpay client (or simulation mock in test mode)
const isLiveRazorpay = !RAZORPAY_KEY_ID.includes('placeholder') && !RAZORPAY_KEY_SECRET.includes('placeholder');
const razorpay = isLiveRazorpay
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

// Ephemeral merchant order store
interface MerchantOrder {
  orderId: string;
  razorpayOrderId?: string;
  amount: number;
  currency: string;
  status: 'PENDING_EVALUATION' | 'HELD_PENDING_APPROVAL' | 'BLOCKED' | 'CREATED' | 'PAID' | 'FAILED';
  agentGuardRequestId?: string;
  pendingApprovalId?: string;
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
      if (body.length > 512 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve({ raw: body, json: body ? JSON.parse(body) : {} });
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  const method = req.method?.toUpperCase();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Signature');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ------------------------------------------------------------------------
    // Route 1: Health & Readiness
    // ------------------------------------------------------------------------
    if (method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        service: 'agentguard-razorpay-merchant',
        agentguardUrl: AGENTGUARD_URL,
        razorpayConfigured: isLiveRazorpay,
        ordersCount: ordersDb.size,
      });
    }

    // ------------------------------------------------------------------------
    // Route 2: Guarded Checkout Initiation
    // ------------------------------------------------------------------------
    if (method === 'POST' && url.pathname === '/api/checkout') {
      const { json } = await parseBody(req);
      const { amount, currency = 'INR', description, promptContext, agentId = 'autonomous-shopper' } = json;

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return sendJson(res, 400, { error: 'Invalid or missing amount' });
      }

      const internalOrderId = `ord_merch_${Date.now()}`;

      // Step A: Pre-Flight Security Evaluation via AgentGuard SDK
      console.log(`[AgentGuard Pre-Flight] Evaluating intended payment of ${amount} ${currency}...`);
      const decision = await agentguard.evaluate({
        action: 'payment.create',
        amount: Number(amount),
        currency: currency.toUpperCase(),
        tool: 'razorpay_payment',
        operation: 'create_razorpay_order',
        agentId,
        description: description || 'Merchant payment execution',
        promptContext,
        idempotencyKey: internalOrderId,
        metadata: {
          merchantOrderId: internalOrderId,
          clientIp: req.socket.remoteAddress,
        },
      });

      console.log(`[AgentGuard Decision] Result: ${decision.status} | RequestId: ${decision.requestId}`);

      // Step B: Enforce Security Outcome
      if (decision.status === 'BLOCK') {
        ordersDb.set(internalOrderId, {
          orderId: internalOrderId,
          amount: Number(amount),
          currency,
          status: 'BLOCKED',
          agentGuardRequestId: decision.requestId,
          createdAt: new Date().toISOString(),
        });

        // Downstream Razorpay API is NEVER called
        return sendJson(res, 403, {
          error: 'PAYMENT_POLICY_BLOCKED',
          message: 'Operation denied by AgentGuard deterministic security boundary.',
          decision: decision.status,
          reason: decision.reason,
          violations: decision.violations,
          agentGuardRequestId: decision.requestId,
        });
      }

      if (decision.status === 'HOLD') {
        ordersDb.set(internalOrderId, {
          orderId: internalOrderId,
          amount: Number(amount),
          currency,
          status: 'HELD_PENDING_APPROVAL',
          agentGuardRequestId: decision.requestId,
          pendingApprovalId: decision.pendingApprovalId,
          createdAt: new Date().toISOString(),
        });

        // Downstream Razorpay API is NEVER called until human approval
        return sendJson(res, 202, {
          status: 'HOLD',
          message: 'High-value transaction requires Human-in-the-Loop approval.',
          pendingApprovalId: decision.pendingApprovalId,
          agentGuardRequestId: decision.requestId,
          instruction: 'Review and approve this transaction in the AgentGuard operator dashboard.',
        });
      }

      // Step C: ALLOW -> Safe to create Razorpay Order
      let razorpayOrderId: string;
      const amountPaise = Math.round(Number(amount) * 100);

      if (razorpay) {
        const rzpOrder = await razorpay.orders.create({
          amount: amountPaise,
          currency: currency.toUpperCase(),
          receipt: internalOrderId,
          notes: {
            agentguardRequestId: decision.requestId,
            agentId,
          },
        });
        razorpayOrderId = rzpOrder.id;
      } else {
        // Simulation mode for local sandbox testing
        razorpayOrderId = `order_sim_${Date.now()}`;
      }

      ordersDb.set(internalOrderId, {
        orderId: internalOrderId,
        razorpayOrderId,
        amount: Number(amount),
        currency,
        status: 'CREATED',
        agentGuardRequestId: decision.requestId,
        createdAt: new Date().toISOString(),
      });

      return sendJson(res, 201, {
        success: true,
        merchantOrderId: internalOrderId,
        razorpayOrderId,
        amount: Number(amount),
        currency,
        agentGuardRequestId: decision.requestId,
        policyVersion: decision.policyVersion,
        message: 'Pre-flight policy ALLOWED. Razorpay order created safely.',
      });
    }

    // ------------------------------------------------------------------------
    // Route 2b: Resume Held Order after Operator Approval
    // ------------------------------------------------------------------------
    if (method === 'POST' && url.pathname === '/api/checkout/resume') {
      const { json } = await parseBody(req);
      const { merchantOrderId, pendingApprovalId } = json;

      if (!merchantOrderId) {
        return sendJson(res, 400, { error: 'merchantOrderId is required' });
      }

      const order = ordersDb.get(merchantOrderId);
      if (!order) {
        return sendJson(res, 404, { error: 'Order not found' });
      }

      if (order.status !== 'HELD_PENDING_APPROVAL') {
        return sendJson(res, 400, {
          error: 'ORDER_NOT_HELD',
          message: `Order status is '${order.status}', cannot resume.`,
        });
      }

      const approvalId = pendingApprovalId || order.pendingApprovalId;
      if (!approvalId) {
        return sendJson(res, 400, { error: 'No pendingApprovalId associated with order' });
      }

      // Check approval status via SDK
      const approvalRecord = await agentguard.getApproval(approvalId);

      if (approvalRecord.status === 'PENDING') {
        return sendJson(res, 202, {
          status: 'HOLD',
          message: 'Approval is still pending review in AgentGuard dashboard.',
          pendingApprovalId: approvalId,
        });
      }

      if (approvalRecord.status === 'REJECTED') {
        order.status = 'BLOCKED';
        return sendJson(res, 403, {
          error: 'APPROVAL_REJECTED',
          message: 'Payment approval was rejected by operator.',
          decision: 'BLOCK',
        });
      }

      if (approvalRecord.status !== 'APPROVED') {
        return sendJson(res, 400, {
          error: 'INVALID_APPROVAL_STATUS',
          message: `Approval status is ${approvalRecord.status}`,
        });
      }

      // Authoritative re-evaluation with humanApprovalToken
      const resumptionDecision = await agentguard.evaluate({
        action: 'payment.create',
        amount: order.amount,
        currency: order.currency,
        tool: 'razorpay_payment',
        operation: 'create_razorpay_order',
        humanApprovalToken: approvalRecord.serverAuthorizationToken,
        idempotencyKey: `${order.orderId}_resume`,
        metadata: {
          resumedFromApprovalId: approvalId,
        },
      });

      if (resumptionDecision.status !== 'ALLOW') {
        return sendJson(res, 403, {
          error: 'RESUMPTION_DENIED',
          message: resumptionDecision.reason,
          decision: resumptionDecision.status,
        });
      }

      // Safe to create Razorpay Order
      let razorpayOrderId: string;
      const amountPaise = Math.round(order.amount * 100);

      if (razorpay) {
        const rzpOrder = await razorpay.orders.create({
          amount: amountPaise,
          currency: order.currency.toUpperCase(),
          receipt: order.orderId,
          notes: {
            agentguardRequestId: resumptionDecision.requestId,
            approvalId,
          },
        });
        razorpayOrderId = rzpOrder.id;
      } else {
        razorpayOrderId = `order_sim_${Date.now()}`;
      }

      order.razorpayOrderId = razorpayOrderId;
      order.status = 'CREATED';

      return sendJson(res, 200, {
        success: true,
        merchantOrderId: order.orderId,
        razorpayOrderId,
        status: 'CREATED',
        agentGuardRequestId: resumptionDecision.requestId,
        message: 'Transaction successfully approved and resumed. Razorpay order created.',
      });
    }

    // ------------------------------------------------------------------------
    // Route 2c: Get Order Details
    // ------------------------------------------------------------------------
    if (method === 'GET' && url.pathname.startsWith('/api/orders/')) {
      const orderId = url.pathname.replace('/api/orders/', '');
      const order = ordersDb.get(orderId);
      if (!order) {
        return sendJson(res, 404, { error: 'Order not found' });
      }
      return sendJson(res, 200, order);
    }

    // ------------------------------------------------------------------------
    // Route 3: Cryptographic Signature Verification
    // ------------------------------------------------------------------------
    if (method === 'POST' && url.pathname === '/api/verify') {
      const { json } = await parseBody(req);
      const { orderId, paymentId, signature } = json;

      if (!orderId || !paymentId || !signature) {
        return sendJson(res, 400, { error: 'orderId, paymentId, and signature are required' });
      }

      // Constant-time HMAC-SHA256 verification
      const expectedDigest = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedDigest, 'utf-8');
      const actualBuffer = Buffer.from(signature, 'utf-8');

      const isValid =
        expectedBuffer.length === actualBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, actualBuffer);

      if (!isValid) {
        return sendJson(res, 400, {
          success: false,
          error: 'INVALID_SIGNATURE',
          message: 'Cryptographic HMAC-SHA256 signature verification failed. Potential payment tampering.',
        });
      }

      return sendJson(res, 200, {
        success: true,
        orderId,
        paymentId,
        status: 'PAID',
        verified: true,
        message: 'Payment cryptographically verified and marked as PAID.',
      });
    }

    // ------------------------------------------------------------------------
    // Route 4: Webhook Signature Verification
    // ------------------------------------------------------------------------
    if (method === 'POST' && url.pathname === '/api/webhook') {
      const { raw, json } = await parseBody(req);
      const signatureHeader = req.headers['x-razorpay-signature'];

      if (!signatureHeader || typeof signatureHeader !== 'string') {
        return sendJson(res, 400, { error: 'Missing X-Razorpay-Signature header' });
      }

      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(raw)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      const actualBuffer = Buffer.from(signatureHeader, 'utf-8');

      const isValid =
        expectedBuffer.length === actualBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, actualBuffer);

      if (!isValid) {
        return sendJson(res, 400, { error: 'Invalid webhook signature' });
      }

      console.log(`[Webhook Event Received]: ${json?.event}`);
      return sendJson(res, 200, { status: 'acknowledged', event: json?.event });
    }

    return sendJson(res, 404, { error: 'Route not found' });
  } catch (err: any) {
    console.error('[Merchant Server Error]:', err);
    return sendJson(res, 500, {
      error: 'INTERNAL_ERROR',
      message: err.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`AgentGuard Razorpay Merchant Example listening on http://localhost:${PORT}`);
  console.log(`AgentGuard Security Gateway: ${AGENTGUARD_URL}`);
});
