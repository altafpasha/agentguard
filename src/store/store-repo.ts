import { Pool } from 'pg';
import {
  IStoreRepository,
  PricingPlan,
  StoreOrder,
  StoreOrderStatus,
  StoreProduct,
} from './types';
import { INITIAL_PRICING_PLANS, INITIAL_PRODUCTS } from './seed-data';

export class MemoryStoreRepository implements IStoreRepository {
  private products = new Map<string, StoreProduct>();
  private orders = new Map<string, StoreOrder>();
  private ordersByNumber = new Map<string, string>(); // orderNumber -> id
  private ordersByPayPal = new Map<string, string>(); // paypalOrderId -> id
  private pricingPlans = new Map<string, PricingPlan>();

  constructor() {
    for (const p of INITIAL_PRODUCTS) {
      this.products.set(p.id, { ...p, createdAt: new Date().toISOString() });
    }
    for (const plan of INITIAL_PRICING_PLANS) {
      this.pricingPlans.set(plan.id, { ...plan });
    }
  }

  public async listProducts(): Promise<StoreProduct[]> {
    return Array.from(this.products.values()).filter((p) => p.isAvailable);
  }

  public async getProductById(id: string): Promise<StoreProduct | null> {
    const p = this.products.get(id);
    return p ? { ...p } : null;
  }

  public async saveProduct(product: StoreProduct): Promise<void> {
    this.products.set(product.id, { ...product });
  }

  public async createOrder(order: StoreOrder): Promise<StoreOrder> {
    const cloned = { ...order };
    this.orders.set(order.id, cloned);
    this.ordersByNumber.set(order.orderNumber, order.id);
    if (order.paypalOrderId) {
      this.ordersByPayPal.set(order.paypalOrderId, order.id);
    }
    return { ...cloned };
  }

  public async getOrderById(id: string): Promise<StoreOrder | null> {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }

  public async getOrderByOrderNumber(orderNumber: string): Promise<StoreOrder | null> {
    const id = this.ordersByNumber.get(orderNumber);
    if (!id) return null;
    return this.getOrderById(id);
  }

  public async getOrderByPayPalOrderId(paypalOrderId: string): Promise<StoreOrder | null> {
    const id = this.ordersByPayPal.get(paypalOrderId);
    if (!id) return null;
    return this.getOrderById(id);
  }

  public async updateOrderStatus(
    id: string,
    status: StoreOrderStatus,
    extra?: {
      paypalOrderId?: string;
      paypalCaptureId?: string;
      paypalApprovalUrl?: string;
      securityDecision?: 'ALLOW' | 'HOLD' | 'BLOCK';
      securityReason?: string;
      humanApprovalId?: string;
    }
  ): Promise<StoreOrder> {
    const o = this.orders.get(id);
    if (!o) {
      throw new Error(`Order ${id} not found`);
    }
    const updated: StoreOrder = {
      ...o,
      status,
      paypalOrderId: extra?.paypalOrderId ?? o.paypalOrderId,
      paypalCaptureId: extra?.paypalCaptureId ?? o.paypalCaptureId,
      paypalApprovalUrl: extra?.paypalApprovalUrl ?? o.paypalApprovalUrl,
      securityDecision: extra?.securityDecision ?? o.securityDecision,
      securityReason: extra?.securityReason ?? o.securityReason,
      humanApprovalId: extra?.humanApprovalId ?? o.humanApprovalId,
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(id, updated);
    if (updated.paypalOrderId) {
      this.ordersByPayPal.set(updated.paypalOrderId, id);
    }
    return { ...updated };
  }

  public async listRecentOrders(limit: number = 50): Promise<StoreOrder[]> {
    return Array.from(this.orders.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  public async listPricingPlans(): Promise<PricingPlan[]> {
    return Array.from(this.pricingPlans.values());
  }

  public async savePricingPlan(plan: PricingPlan): Promise<void> {
    this.pricingPlans.set(plan.id, { ...plan });
  }
}

export class PostgresStoreRepository implements IStoreRepository {
  private pool: Pool;
  private memoryFallback: MemoryStoreRepository;
  private isInitialized = false;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.memoryFallback = new MemoryStoreRepository();
  }

  private async ensureTables(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS store_products (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(64) NOT NULL,
          price_cents BIGINT NOT NULL,
          price_formatted VARCHAR(32) NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          description TEXT NOT NULL,
          details TEXT,
          image_url TEXT,
          stock INTEGER NOT NULL DEFAULT 100,
          is_available BOOLEAN NOT NULL DEFAULT TRUE,
          merchant_email VARCHAR(255) NOT NULL,
          merchant_name VARCHAR(255) NOT NULL,
          is_malicious BOOLEAN NOT NULL DEFAULT FALSE,
          expected_scenario VARCHAR(32) DEFAULT 'A',
          injection_snippet TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS store_orders (
          id UUID PRIMARY KEY,
          order_number VARCHAR(64) NOT NULL UNIQUE,
          items JSONB NOT NULL,
          total_cents BIGINT NOT NULL,
          total_formatted VARCHAR(32) NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          merchant_email VARCHAR(255) NOT NULL,
          merchant_name VARCHAR(255) NOT NULL,
          status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
          customer_email VARCHAR(255),
          agent_id VARCHAR(128),
          paypal_order_id VARCHAR(128),
          paypal_approval_url TEXT,
          paypal_capture_id VARCHAR(128),
          security_decision VARCHAR(16) NOT NULL DEFAULT 'ALLOW',
          security_reason TEXT,
          security_violations JSONB DEFAULT '[]'::jsonb,
          human_approval_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS store_pricing_plans (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          tier VARCHAR(64) NOT NULL,
          price_monthly_cents BIGINT NOT NULL,
          price_monthly_formatted VARCHAR(32) NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'USD',
          billing_interval VARCHAR(32) NOT NULL DEFAULT 'monthly',
          description TEXT NOT NULL,
          features JSONB NOT NULL DEFAULT '[]'::jsonb,
          roadmap_features JSONB NOT NULL DEFAULT '[]'::jsonb,
          badge VARCHAR(64),
          is_popular BOOLEAN NOT NULL DEFAULT FALSE,
          status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
          cta_text VARCHAR(64) NOT NULL,
          cta_action VARCHAR(64) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Seed products if empty
      const prodCheck = await this.pool.query('SELECT COUNT(*) FROM store_products');
      if (parseInt(prodCheck.rows[0].count, 10) === 0) {
        for (const p of INITIAL_PRODUCTS) {
          await this.pool.query(
            `INSERT INTO store_products (
              id, name, category, price_cents, price_formatted, currency,
              description, details, image_url, stock, is_available,
              merchant_email, merchant_name, is_malicious, expected_scenario, injection_snippet
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            ON CONFLICT (id) DO NOTHING`,
            [
              p.id,
              p.name,
              p.category,
              p.priceCents.toString(),
              p.priceFormatted,
              p.currency,
              p.description,
              p.details || null,
              p.imageUrl || null,
              p.stock,
              p.isAvailable,
              p.merchantEmail,
              p.merchantName,
              p.isMalicious,
              p.expectedScenario || 'A',
              p.injectionSnippet || null,
            ]
          );
        }
      }

      // Seed pricing plans if empty
      const planCheck = await this.pool.query('SELECT COUNT(*) FROM store_pricing_plans');
      if (parseInt(planCheck.rows[0].count, 10) === 0) {
        for (const plan of INITIAL_PRICING_PLANS) {
          await this.pool.query(
            `INSERT INTO store_pricing_plans (
              id, name, tier, price_monthly_cents, price_monthly_formatted, currency,
              billing_interval, description, features, roadmap_features, badge, is_popular, status, cta_text, cta_action
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (id) DO NOTHING`,
            [
              plan.id,
              plan.name,
              plan.tier,
              plan.priceMonthlyCents.toString(),
              plan.priceMonthlyFormatted,
              plan.currency,
              plan.billingInterval,
              plan.description,
              JSON.stringify(plan.features),
              JSON.stringify(plan.roadmapFeatures),
              plan.badge || null,
              plan.isPopular || false,
              plan.status,
              plan.ctaText,
              plan.ctaAction,
            ]
          );
        }
      }

      this.isInitialized = true;
    } catch {
      // If Postgres connection is not available, fallback to memory
      this.isInitialized = false;
    }
  }

  public async listProducts(): Promise<StoreProduct[]> {
    try {
      await this.ensureTables();
      const res = await this.pool.query(
        'SELECT * FROM store_products WHERE is_available = TRUE ORDER BY price_cents ASC'
      );
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        priceCents: BigInt(row.price_cents),
        priceFormatted: row.price_formatted,
        currency: row.currency,
        description: row.description,
        details: row.details,
        imageUrl: row.image_url,
        stock: row.stock,
        isAvailable: row.is_available,
        merchantEmail: row.merchant_email,
        merchantName: row.merchant_name,
        isMalicious: row.is_malicious,
        expectedScenario: row.expected_scenario,
        injectionSnippet: row.injection_snippet,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      }));
    } catch {
      return this.memoryFallback.listProducts();
    }
  }

  public async getProductById(id: string): Promise<StoreProduct | null> {
    try {
      await this.ensureTables();
      const res = await this.pool.query('SELECT * FROM store_products WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        priceCents: BigInt(row.price_cents),
        priceFormatted: row.price_formatted,
        currency: row.currency,
        description: row.description,
        details: row.details,
        imageUrl: row.image_url,
        stock: row.stock,
        isAvailable: row.is_available,
        merchantEmail: row.merchant_email,
        merchantName: row.merchant_name,
        isMalicious: row.is_malicious,
        expectedScenario: row.expected_scenario,
        injectionSnippet: row.injection_snippet,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
      };
    } catch {
      return this.memoryFallback.getProductById(id);
    }
  }

  public async saveProduct(product: StoreProduct): Promise<void> {
    try {
      await this.ensureTables();
      await this.pool.query(
        `INSERT INTO store_products (
          id, name, category, price_cents, price_formatted, currency,
          description, details, image_url, stock, is_available,
          merchant_email, merchant_name, is_malicious, expected_scenario, injection_snippet
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          price_cents = EXCLUDED.price_cents,
          price_formatted = EXCLUDED.price_formatted,
          currency = EXCLUDED.currency,
          description = EXCLUDED.description,
          details = EXCLUDED.details,
          image_url = EXCLUDED.image_url,
          stock = EXCLUDED.stock,
          is_available = EXCLUDED.is_available,
          merchant_email = EXCLUDED.merchant_email,
          merchant_name = EXCLUDED.merchant_name,
          is_malicious = EXCLUDED.is_malicious,
          expected_scenario = EXCLUDED.expected_scenario,
          injection_snippet = EXCLUDED.injection_snippet`,
        [
          product.id,
          product.name,
          product.category,
          product.priceCents.toString(),
          product.priceFormatted,
          product.currency,
          product.description,
          product.details || null,
          product.imageUrl || null,
          product.stock,
          product.isAvailable,
          product.merchantEmail,
          product.merchantName,
          product.isMalicious,
          product.expectedScenario || 'A',
          product.injectionSnippet || null,
        ]
      );
    } catch {
      await this.memoryFallback.saveProduct(product);
    }
  }

  public async createOrder(order: StoreOrder): Promise<StoreOrder> {
    try {
      await this.ensureTables();
      const serializedItems = JSON.stringify(
        order.items.map((it) => ({
          ...it,
          unitPriceCents: it.unitPriceCents.toString(),
          subtotalCents: it.subtotalCents.toString(),
        }))
      );
      await this.pool.query(
        `INSERT INTO store_orders (
          id, order_number, items, total_cents, total_formatted, currency,
          merchant_email, merchant_name, status, customer_email, agent_id,
          paypal_order_id, paypal_approval_url, paypal_capture_id,
          security_decision, security_reason, security_violations, human_approval_id,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          order.id,
          order.orderNumber,
          serializedItems,
          order.totalCents.toString(),
          order.totalFormatted,
          order.currency,
          order.merchantEmail,
          order.merchantName,
          order.status,
          order.customerEmail || null,
          order.agentId || null,
          order.paypalOrderId || null,
          order.paypalApprovalUrl || null,
          order.paypalCaptureId || null,
          order.securityDecision,
          order.securityReason || null,
          JSON.stringify(order.securityViolations || []),
          order.humanApprovalId || null,
          order.createdAt,
          order.updatedAt,
        ]
      );
      return { ...order };
    } catch {
      return this.memoryFallback.createOrder(order);
    }
  }

  public async getOrderById(id: string): Promise<StoreOrder | null> {
    try {
      await this.ensureTables();
      const res = await this.pool.query('SELECT * FROM store_orders WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      return this.mapOrderRow(res.rows[0]);
    } catch {
      return this.memoryFallback.getOrderById(id);
    }
  }

  public async getOrderByOrderNumber(orderNumber: string): Promise<StoreOrder | null> {
    try {
      await this.ensureTables();
      const res = await this.pool.query('SELECT * FROM store_orders WHERE order_number = $1', [orderNumber]);
      if (res.rows.length === 0) return null;
      return this.mapOrderRow(res.rows[0]);
    } catch {
      return this.memoryFallback.getOrderByOrderNumber(orderNumber);
    }
  }

  public async getOrderByPayPalOrderId(paypalOrderId: string): Promise<StoreOrder | null> {
    try {
      await this.ensureTables();
      const res = await this.pool.query('SELECT * FROM store_orders WHERE paypal_order_id = $1', [paypalOrderId]);
      if (res.rows.length === 0) return null;
      return this.mapOrderRow(res.rows[0]);
    } catch {
      return this.memoryFallback.getOrderByPayPalOrderId(paypalOrderId);
    }
  }

  public async updateOrderStatus(
    id: string,
    status: StoreOrderStatus,
    extra?: {
      paypalOrderId?: string;
      paypalCaptureId?: string;
      paypalApprovalUrl?: string;
      securityDecision?: 'ALLOW' | 'HOLD' | 'BLOCK';
      securityReason?: string;
      humanApprovalId?: string;
    }
  ): Promise<StoreOrder> {
    try {
      await this.ensureTables();
      const now = new Date().toISOString();
      const res = await this.pool.query(
        `UPDATE store_orders
         SET status = $1,
             paypal_order_id = COALESCE($2, paypal_order_id),
             paypal_capture_id = COALESCE($3, paypal_capture_id),
             paypal_approval_url = COALESCE($4, paypal_approval_url),
             security_decision = COALESCE($5, security_decision),
             security_reason = COALESCE($6, security_reason),
             human_approval_id = COALESCE($7, human_approval_id),
             updated_at = $8
         WHERE id = $9
         RETURNING *`,
        [
          status,
          extra?.paypalOrderId || null,
          extra?.paypalCaptureId || null,
          extra?.paypalApprovalUrl || null,
          extra?.securityDecision || null,
          extra?.securityReason || null,
          extra?.humanApprovalId || null,
          now,
          id,
        ]
      );
      if (res.rows.length === 0) {
        throw new Error(`Order ${id} not found`);
      }
      return this.mapOrderRow(res.rows[0]);
    } catch {
      return this.memoryFallback.updateOrderStatus(id, status, extra);
    }
  }

  public async listRecentOrders(limit: number = 50): Promise<StoreOrder[]> {
    try {
      await this.ensureTables();
      const res = await this.pool.query(
        'SELECT * FROM store_orders ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      return res.rows.map((row) => this.mapOrderRow(row));
    } catch {
      return this.memoryFallback.listRecentOrders(limit);
    }
  }

  public async listPricingPlans(): Promise<PricingPlan[]> {
    try {
      await this.ensureTables();
      const res = await this.pool.query('SELECT * FROM store_pricing_plans ORDER BY price_monthly_cents ASC');
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tier: row.tier,
        priceMonthlyCents: BigInt(row.price_monthly_cents),
        priceMonthlyFormatted: row.price_monthly_formatted,
        currency: row.currency,
        billingInterval: row.billing_interval,
        description: row.description,
        features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features,
        roadmapFeatures: typeof row.roadmap_features === 'string' ? JSON.parse(row.roadmap_features) : row.roadmap_features,
        badge: row.badge,
        isPopular: row.is_popular,
        status: row.status,
        ctaText: row.cta_text,
        ctaAction: row.cta_action,
      }));
    } catch {
      return this.memoryFallback.listPricingPlans();
    }
  }

  public async savePricingPlan(plan: PricingPlan): Promise<void> {
    try {
      await this.ensureTables();
      await this.pool.query(
        `INSERT INTO store_pricing_plans (
          id, name, tier, price_monthly_cents, price_monthly_formatted, currency,
          billing_interval, description, features, roadmap_features, badge, is_popular, status, cta_text, cta_action
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          tier = EXCLUDED.tier,
          price_monthly_cents = EXCLUDED.price_monthly_cents,
          price_monthly_formatted = EXCLUDED.price_monthly_formatted,
          currency = EXCLUDED.currency,
          billing_interval = EXCLUDED.billing_interval,
          description = EXCLUDED.description,
          features = EXCLUDED.features,
          roadmap_features = EXCLUDED.roadmap_features,
          badge = EXCLUDED.badge,
          is_popular = EXCLUDED.is_popular,
          status = EXCLUDED.status,
          cta_text = EXCLUDED.cta_text,
          cta_action = EXCLUDED.cta_action`,
        [
          plan.id,
          plan.name,
          plan.tier,
          plan.priceMonthlyCents.toString(),
          plan.priceMonthlyFormatted,
          plan.currency,
          plan.billingInterval,
          plan.description,
          JSON.stringify(plan.features),
          JSON.stringify(plan.roadmapFeatures),
          plan.badge || null,
          plan.isPopular || false,
          plan.status,
          plan.ctaText,
          plan.ctaAction,
        ]
      );
    } catch {
      await this.memoryFallback.savePricingPlan(plan);
    }
  }

  private mapOrderRow(row: any): StoreOrder {
    const rawItems = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    const items = (rawItems || []).map((item: any) => ({
      ...item,
      unitPriceCents: BigInt(item.unitPriceCents || 0),
      subtotalCents: BigInt(item.subtotalCents || 0),
    }));

    return {
      id: row.id,
      orderNumber: row.order_number,
      items,
      totalCents: BigInt(row.total_cents),
      totalFormatted: row.total_formatted,
      currency: row.currency,
      merchantEmail: row.merchant_email,
      merchantName: row.merchant_name,
      status: row.status,
      customerEmail: row.customer_email,
      agentId: row.agent_id,
      paypalOrderId: row.paypal_order_id,
      paypalApprovalUrl: row.paypal_approval_url,
      paypalCaptureId: row.paypal_capture_id,
      securityDecision: row.security_decision,
      securityReason: row.security_reason,
      securityViolations: typeof row.security_violations === 'string' ? JSON.parse(row.security_violations) : row.security_violations,
      humanApprovalId: row.human_approval_id,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    };
  }
}
