import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { IStoreRepository, StoreOrder, StoreOrderItem } from '../store/types';
import { InjectionScanner } from '../scanner';
import { PolicyEngine } from '../policy';
import { IPayPalSandboxAdapter } from '../payment';
import { IAuditRepository } from '../audit';
import { HumanApprovalService } from '../approval/service';
import {
  ValidationError,
  NotFoundError,
  PolicyViolationError,
  HumanApprovalRequiredError,
  InjectionDetectedError,
} from '../common/errors';

export interface StoreRouteOptions {
  storeRepo: IStoreRepository;
  scanner: InjectionScanner;
  policyEngine: PolicyEngine;
  paymentAdapter: IPayPalSandboxAdapter;
  auditRepo: IAuditRepository;
  approvalService?: HumanApprovalService;
}

const checkoutItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int().min(1, 'quantity must be at least 1').max(100, 'quantity max 100'),
});

const checkoutRequestSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, 'Cart cannot be empty'),
  customerEmail: z.string().email().optional(),
  agentId: z.string().optional(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  humanApprovalToken: z.string().optional(),
  clientContextNotes: z.string().optional(),
});

export const storeRoutes: FastifyPluginAsync<StoreRouteOptions> = async (
  fastify: FastifyInstance,
  options: StoreRouteOptions
) => {
  const { storeRepo, scanner, policyEngine, paymentAdapter, auditRepo, approvalService } = options;

  // 1. List Products
  fastify.get('/api/v1/store/products', async () => {
    const products = await storeRepo.listProducts();
    return {
      products: products.map((p) => ({
        ...p,
        priceCents: p.priceCents.toString(),
      })),
      total: products.length,
    };
  });

  // 2. Get Product Detail
  fastify.get('/api/v1/store/products/:id', async (req) => {
    const { id } = req.params as { id: string };
    const product = await storeRepo.getProductById(id);
    if (!product) {
      throw new NotFoundError(`Product '${id}' was not found in catalog.`);
    }
    return {
      product: {
        ...product,
        priceCents: product.priceCents.toString(),
      },
    };
  });

  // 3. Store Checkout (Server-authoritative price & policy verification)
  fastify.post('/api/v1/store/checkout', async (req, reply) => {
    const parseResult = checkoutRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid checkout request payload', parseResult.error.flatten());
    }

    const payload = parseResult.data;
    const requestId = req.id as string;
    const now = new Date().toISOString();

    // Scan for prompt injection in context notes if present
    if (payload.clientContextNotes) {
      const scanResult = await scanner.scan(payload.clientContextNotes);
      if (scanResult.isThreatDetected) {
        await auditRepo.recordEvent({
          requestId,
          agentId: payload.agentId || 'store-buyer',
          eventType: 'INJECTION_BLOCKED',
          status: 'BLOCKED',
          payloadSummary: {
            riskScore: scanResult.riskScore,
            threatCategories: scanResult.findings.map((f) => f.category),
            findings: scanResult.findings,
          },
          errorMessage: 'Checkout rejected: adversarial prompt injection detected in order context.',
        });

        throw new InjectionDetectedError(
          'Checkout rejected: adversarial prompt injection or instruction override detected in order context.',
          { scanResult }
        );
      }
    }

    // Server-side product price & merchant resolution
    let totalCents = 0n;
    const orderItems: StoreOrderItem[] = [];
    let merchantEmail = '';
    let merchantName = '';
    let currency = 'USD';
    let isMaliciousFixture = false;
    let maliciousSnippet = '';

    for (const item of payload.items) {
      const product = await storeRepo.getProductById(item.productId);
      if (!product) {
        throw new NotFoundError(`Product '${item.productId}' not found in server catalog.`);
      }
      if (!product.isAvailable || product.stock < item.quantity) {
        throw new ValidationError(`Product '${product.name}' is currently out of stock.`);
      }

      const itemTotalCents = product.priceCents * BigInt(item.quantity);
      totalCents += itemTotalCents;

      orderItems.push({
        productId: product.id,
        name: product.name,
        unitPriceCents: product.priceCents,
        unitPriceFormatted: product.priceFormatted,
        quantity: item.quantity,
        subtotalCents: itemTotalCents,
        subtotalFormatted: (Number(itemTotalCents) / 100).toFixed(2),
      });

      // Track merchant and malicious fixture
      merchantEmail = product.merchantEmail;
      merchantName = product.merchantName;
      currency = product.currency;
      if (product.isMalicious) {
        isMaliciousFixture = true;
        maliciousSnippet = product.injectionSnippet || '';
      }
    }

    // If an item contains a malicious prompt injection fixture, trigger gateway threat scanner
    if (isMaliciousFixture && maliciousSnippet) {
      const scanResult = await scanner.scan(maliciousSnippet);
      if (scanResult.isThreatDetected) {
        await auditRepo.recordEvent({
          requestId,
          agentId: payload.agentId || 'store-buyer',
          eventType: 'INJECTION_BLOCKED',
          status: 'BLOCKED',
          payloadSummary: {
            riskScore: scanResult.riskScore,
            threatCategories: scanResult.findings.map((f) => f.category),
            findings: scanResult.findings,
          },
          errorMessage: 'Checkout halted: third-party product listing contains adversarial prompt injection.',
        });

        throw new InjectionDetectedError(
          'Checkout halted: adversarial prompt injection detected in product listing content.',
          { scanResult }
        );
      }
    }

    const totalFormatted = (Number(totalCents) / 100).toFixed(2);
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const orderId = randomUUID();

    // Deterministic Policy Engine Evaluation (Strict Authority)
    const authRecord = await policyEngine.authorize({
      requestId,
      agentId: payload.agentId || 'store-buyer',
      tool: 'paypal_payment',
      operation: 'create_order',
      amount: Number(totalCents) / 100,
      currency,
      merchant: { email: merchantEmail, name: merchantName },
      description: `Store Order ${orderNumber}: ${orderItems.map((i) => `${i.quantity}x ${i.name}`).join(', ')}`,
      humanApprovalToken: payload.humanApprovalToken,
    });

    // Handle BLOCK verdict
    if (authRecord.decision === 'BLOCK') {
      const blockedOrder: StoreOrder = {
        id: orderId,
        orderNumber,
        items: orderItems,
        totalCents,
        totalFormatted,
        currency,
        merchantEmail,
        merchantName,
        status: 'BLOCKED',
        customerEmail: payload.customerEmail,
        agentId: payload.agentId,
        securityDecision: 'BLOCK',
        securityReason: authRecord.reason,
        securityViolations: authRecord.violations,
        createdAt: now,
        updatedAt: now,
      };
      await storeRepo.createOrder(blockedOrder);

      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId || 'store-buyer',
        eventType: 'POLICY_BLOCKED',
        status: 'BLOCKED',
        policyDecision: 'BLOCK',
        amountCents: totalCents,
        amountFormatted: totalFormatted,
        currency,
        merchant: merchantEmail,
        payloadSummary: { orderNumber, violations: authRecord.violations, reason: authRecord.reason },
        errorMessage: `Checkout blocked by security policy rules: ${authRecord.reason}`,
      });

      throw new PolicyViolationError(
        `Checkout blocked by security policy rules: ${authRecord.reason}`,
        { violations: authRecord.violations }
      );
    }

    // Handle HOLD verdict (High-value or threshold check)
    if (authRecord.decision === 'HOLD') {
      let pendingApprovalId: string | undefined;
      if (approvalService) {
        const pending = await approvalService.createPendingApproval({
          requestId,
          agentId: payload.agentId || 'store-buyer',
          policyId: authRecord.policyId,
          policyVersion: authRecord.policyVersion,
          tool: 'paypal_payment',
          operation: 'create_order',
          amountCents: totalCents,
          amountFormatted: totalFormatted,
          currency,
          merchant: merchantEmail,
          description: `Store Order ${orderNumber}: ${orderItems.map((i) => `${i.quantity}x ${i.name}`).join(', ')}`,
          riskReasons: authRecord.violations,
        });
        pendingApprovalId = pending.id;
      }

      const heldOrder: StoreOrder = {
        id: orderId,
        orderNumber,
        items: orderItems,
        totalCents,
        totalFormatted,
        currency,
        merchantEmail,
        merchantName,
        status: 'HELD_FOR_APPROVAL',
        customerEmail: payload.customerEmail,
        agentId: payload.agentId,
        securityDecision: 'HOLD',
        securityReason: authRecord.reason,
        securityViolations: authRecord.violations,
        humanApprovalId: pendingApprovalId,
        createdAt: now,
        updatedAt: now,
      };
      await storeRepo.createOrder(heldOrder);

      await auditRepo.recordEvent({
        requestId,
        agentId: payload.agentId || 'store-buyer',
        eventType: 'APPROVAL_REQUIRED',
        status: 'PENDING_APPROVAL',
        policyDecision: 'HOLD',
        amountCents: totalCents,
        amountFormatted: totalFormatted,
        currency,
        merchant: merchantEmail,
        payloadSummary: { orderNumber, approvalId: pendingApprovalId, reason: authRecord.reason },
      });

      throw new HumanApprovalRequiredError(
        'Transaction exceeds automated authorization threshold. Explicit human approval token required.',
        { violations: authRecord.violations, approvalId: pendingApprovalId, orderNumber, orderId }
      );
    }

    // Policy Approved -> Create Sandbox Order via PayPal Adapter
    const defaultReturnUrl = 'http://localhost:3000/storefront/checkout/return';
    const defaultCancelUrl = 'http://localhost:3000/storefront/checkout/cancel';

    const paypalOrder = await paymentAdapter.createOrder(
      {
        agentId: payload.agentId || 'store-buyer',
        amount: Number(totalCents) / 100,
        currency,
        recipient: { email: merchantEmail, name: merchantName },
        description: `Order ${orderNumber}`,
        intent: 'CAPTURE',
        metadata: {
          referenceId: orderNumber,
          returnUrl: payload.returnUrl || defaultReturnUrl,
          cancelUrl: payload.cancelUrl || defaultCancelUrl,
        },
      },
      requestId
    );

    const approvalLink = (paypalOrder.links || []).find((l: any) => l.rel === 'approve');
    const paypalApprovalUrl = approvalLink?.href || '';

    const createdOrder: StoreOrder = {
      id: orderId,
      orderNumber,
      items: orderItems,
      totalCents,
      totalFormatted,
      currency,
      merchantEmail,
      merchantName,
      status: 'PAYPAL_ORDER_CREATED',
      customerEmail: payload.customerEmail,
      agentId: payload.agentId,
      paypalOrderId: paypalOrder.id,
      paypalApprovalUrl,
      securityDecision: 'ALLOW',
      createdAt: now,
      updatedAt: now,
    };
    await storeRepo.createOrder(createdOrder);

    await auditRepo.recordEvent({
      requestId,
      agentId: payload.agentId || 'store-buyer',
      eventType: 'ORDER_CREATED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
      amountCents: totalCents,
      amountFormatted: totalFormatted,
      currency,
      merchant: merchantEmail,
      paypalReference: paypalOrder.id,
      payloadSummary: {
        orderNumber,
        orderId,
        paypalOrderId: paypalOrder.id,
        paypalApprovalUrl,
      },
    });

    return reply.status(200).send({
      success: true,
      orderId,
      orderNumber,
      status: 'PAYPAL_ORDER_CREATED',
      total: Number(totalCents) / 100,
      totalFormatted,
      currency,
      paypalOrderId: paypalOrder.id,
      approvalUrl: paypalApprovalUrl,
      securityVerification: {
        policyDecision: 'ALLOW',
        spendingLimitsVerified: true,
      },
    });
  });

  // 4. Capture & Verify PayPal Sandbox Order on Buyer Return
  fastify.post('/api/v1/store/orders/:orderId/capture', async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const requestId = req.id as string;

    const order =
      (await storeRepo.getOrderById(orderId)) ||
      (await storeRepo.getOrderByOrderNumber(orderId)) ||
      (await storeRepo.getOrderByPayPalOrderId(orderId));

    if (!order) {
      throw new NotFoundError(`Store order '${orderId}' not found.`);
    }

    if (order.status === 'COMPLETED') {
      return reply.status(200).send({
        success: true,
        alreadyCaptured: true,
        status: 'COMPLETED',
        orderNumber: order.orderNumber,
        paypalOrderId: order.paypalOrderId,
        paypalCaptureId: order.paypalCaptureId,
        message: 'Order was already captured and verified.',
      });
    }

    if (!order.paypalOrderId) {
      throw new ValidationError('Order does not have an active PayPal Order ID to capture.');
    }

    // Verify order with PayPal Sandbox API
    const reconciliation = await paymentAdapter.reconcileOrder(order.paypalOrderId, {
      amount: Number(order.totalCents) / 100,
      currency: order.currency,
      recipientEmail: order.merchantEmail,
      referenceId: order.orderNumber,
    });

    if (reconciliation.discrepancies.length > 0) {
      await auditRepo.recordEvent({
        requestId,
        agentId: order.agentId || 'store-buyer',
        eventType: 'PAYMENT_FAILED',
        status: 'FAILED',
        payloadSummary: {
          orderNumber: order.orderNumber,
          discrepancies: reconciliation.discrepancies,
        },
        errorMessage: `Payment capture aborted: parameter tampering detected: ${reconciliation.discrepancies.join(', ')}`,
      });

      throw new PolicyViolationError(
        `PayPal Sandbox order reconciliation mismatch: ${reconciliation.discrepancies.join(', ')}`
      );
    }

    // Execute capture through trusted payment adapter
    const paymentResult = await paymentAdapter.executePayment(
      {
        agentId: order.agentId || 'store-buyer',
        requestId,
        amount: Number(order.totalCents) / 100,
        currency: order.currency,
        recipient: { email: order.merchantEmail },
        description: `Order ${order.orderNumber}`,
      },
      requestId,
      {
        preApprovedOrderId: order.paypalOrderId,
        serverAuthorizationToken: order.securityDecision === 'ALLOW' ? `auth_${order.orderNumber}` : undefined,
      }
    );

    const paypalCaptureId = paymentResult.paypalCaptureId || `CAP-${order.paypalOrderId.slice(-8)}`;

    const updatedOrder = await storeRepo.updateOrderStatus(order.id, 'COMPLETED', {
      paypalCaptureId,
    });

    await auditRepo.recordEvent({
      requestId,
      agentId: order.agentId || 'store-buyer',
      eventType: 'PAYMENT_COMPLETED',
      status: 'SUCCESS',
      policyDecision: 'ALLOW',
      amountCents: order.totalCents,
      amountFormatted: order.totalFormatted,
      currency: order.currency,
      merchant: order.merchantEmail,
      paypalReference: paypalCaptureId,
      payloadSummary: {
        orderNumber: order.orderNumber,
        paypalOrderId: order.paypalOrderId,
        paypalCaptureId,
      },
    });

    return reply.status(200).send({
      success: true,
      status: 'COMPLETED',
      orderNumber: updatedOrder.orderNumber,
      orderId: updatedOrder.id,
      total: Number(updatedOrder.totalCents) / 100,
      totalFormatted: updatedOrder.totalFormatted,
      currency: updatedOrder.currency,
      paypalOrderId: updatedOrder.paypalOrderId,
      paypalCaptureId,
      message: 'PayPal Sandbox payment captured and verified successfully.',
    });
  });

  // 5. Cancel Store Order
  fastify.post('/api/v1/store/orders/:orderId/cancel', async (req) => {
    const { orderId } = req.params as { orderId: string };
    const order =
      (await storeRepo.getOrderById(orderId)) ||
      (await storeRepo.getOrderByOrderNumber(orderId)) ||
      (await storeRepo.getOrderByPayPalOrderId(orderId));

    if (!order) {
      throw new NotFoundError(`Store order '${orderId}' not found.`);
    }

    const updated = await storeRepo.updateOrderStatus(order.id, 'CANCELLED');
    await auditRepo.recordEvent({
      requestId: req.id as string,
      agentId: order.agentId || 'store-buyer',
      eventType: 'PAYMENT_FAILED',
      status: 'FAILED',
      payloadSummary: { orderNumber: order.orderNumber, reason: 'Buyer cancelled checkout.' },
    });

    return {
      success: true,
      status: 'CANCELLED',
      orderNumber: updated.orderNumber,
    };
  });

  // 6. Get Order Details
  fastify.get('/api/v1/store/orders/:id', async (req) => {
    const { id } = req.params as { id: string };
    const order =
      (await storeRepo.getOrderById(id)) ||
      (await storeRepo.getOrderByOrderNumber(id)) ||
      (await storeRepo.getOrderByPayPalOrderId(id));

    if (!order) {
      throw new NotFoundError(`Order '${id}' was not found.`);
    }

    return {
      order: {
        ...order,
        totalCents: order.totalCents.toString(),
        items: order.items.map((i) => ({
          ...i,
          unitPriceCents: i.unitPriceCents.toString(),
          subtotalCents: i.subtotalCents.toString(),
        })),
      },
    };
  });

  // 7. List Recent Store Orders (For Dashboard and Storefront History)
  fastify.get('/api/v1/store/orders', async (req) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const orders = await storeRepo.listRecentOrders(limit);
    return {
      orders: orders.map((o) => ({
        ...o,
        totalCents: o.totalCents.toString(),
        items: o.items.map((i) => ({
          ...i,
          unitPriceCents: i.unitPriceCents.toString(),
          subtotalCents: i.subtotalCents.toString(),
        })),
      })),
      total: orders.length,
    };
  });

  // 8. List Pricing Plans (Phase 5)
  fastify.get('/api/v1/pricing/plans', async () => {
    const plans = await storeRepo.listPricingPlans();
    return {
      plans: plans.map((p) => ({
        ...p,
        priceMonthlyCents: p.priceMonthlyCents.toString(),
      })),
      total: plans.length,
    };
  });
};
