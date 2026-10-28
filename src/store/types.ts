export interface StoreProduct {
  id: string;
  name: string;
  category: string;
  priceCents: bigint;
  priceFormatted: string;
  currency: string;
  description: string;
  details?: string;
  imageUrl?: string;
  stock: number;
  isAvailable: boolean;
  merchantEmail: string;
  merchantName: string;
  isMalicious: boolean;
  expectedScenario?: 'A' | 'B' | 'C' | 'D' | 'DENY';
  injectionSnippet?: string;
  createdAt?: string;
}

export interface StoreOrderItem {
  productId: string;
  name: string;
  unitPriceCents: bigint;
  unitPriceFormatted: string;
  quantity: number;
  subtotalCents: bigint;
  subtotalFormatted: string;
}

export type StoreOrderStatus =
  | 'PENDING'
  | 'HELD_FOR_APPROVAL'
  | 'BLOCKED'
  | 'PAYPAL_ORDER_CREATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface StoreOrder {
  id: string;
  orderNumber: string;
  items: StoreOrderItem[];
  totalCents: bigint;
  totalFormatted: string;
  currency: string;
  merchantEmail: string;
  merchantName: string;
  status: StoreOrderStatus;
  customerEmail?: string;
  agentId?: string;
  paypalOrderId?: string;
  paypalApprovalUrl?: string;
  paypalCaptureId?: string;
  securityDecision: 'ALLOW' | 'HOLD' | 'BLOCK';
  securityReason?: string;
  securityViolations?: string[];
  humanApprovalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutRequest {
  items: Array<{ productId: string; quantity: number }>;
  customerEmail?: string;
  agentId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  humanApprovalToken?: string;
  clientContextNotes?: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  tier: 'developer' | 'team' | 'enterprise';
  priceMonthlyCents: bigint;
  priceMonthlyFormatted: string;
  currency: string;
  billingInterval: 'monthly' | 'annual';
  description: string;
  features: string[];
  roadmapFeatures: string[];
  badge?: string;
  isPopular?: boolean;
  status: 'AVAILABLE' | 'PREVIEW' | 'CONTACT_SALES';
  ctaText: string;
  ctaAction: 'get_started' | 'demo_trial' | 'contact_sales';
}

export interface IStoreRepository {
  listProducts(): Promise<StoreProduct[]>;
  getProductById(id: string): Promise<StoreProduct | null>;
  saveProduct(product: StoreProduct): Promise<void>;
  
  createOrder(order: StoreOrder): Promise<StoreOrder>;
  getOrderById(id: string): Promise<StoreOrder | null>;
  getOrderByOrderNumber(orderNumber: string): Promise<StoreOrder | null>;
  getOrderByPayPalOrderId(paypalOrderId: string): Promise<StoreOrder | null>;
  updateOrderStatus(
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
  ): Promise<StoreOrder>;
  listRecentOrders(limit?: number): Promise<StoreOrder[]>;

  listPricingPlans(): Promise<PricingPlan[]>;
  savePricingPlan(plan: PricingPlan): Promise<void>;
}
