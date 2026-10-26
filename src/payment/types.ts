import { PaymentOrderRequest } from '../common/types';

export type PaymentExecutionStatus =
  | 'EXECUTION_NOT_ENABLED'
  | 'PENDING_APPROVAL'
  | 'REJECTED_POLICY'
  | 'REJECTED_INJECTION'
  | 'FAILED'
  | 'PAYPAL_ORDER_CREATED'
  | 'PAYPAL_API_PENDING'
  | 'COMPLETED'
  | 'RECONCILED_SUCCESS'
  | 'RECONCILED_PENDING'
  | 'RECONCILED_FAILED';

export interface PaymentExecutionResult {
  executed: boolean;
  status: PaymentExecutionStatus;
  message: string;
  requestId: string;
  agentId: string;
  amount: number;
  currency: string;
  recipientEmail: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  approvalUrl?: string;
  executionTimestamp: string;
  reconciliation?: OrderReconciliationResult;
  error?: string;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox';
  apiBaseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  tokenExpiryBufferSeconds?: number;
}

export interface PayPalOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

export type PayPalOrderIntent = 'CAPTURE' | 'AUTHORIZE';

export type PayPalOrderStatus =
  | 'CREATED'
  | 'SAVED'
  | 'APPROVED'
  | 'VOIDED'
  | 'COMPLETED'
  | 'PAYER_ACTION_REQUIRED';

export interface PayPalAmount {
  currency_code: string;
  value: string;
  breakdown?: Record<string, unknown>;
}

export interface PayPalPayee {
  email_address?: string;
  merchant_id?: string;
}

export interface PayPalCaptureDetails {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  amount: PayPalAmount;
  final_capture?: boolean;
  create_time?: string;
  update_time?: string;
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  amount: PayPalAmount;
  payee?: PayPalPayee;
  description?: string;
  payments?: {
    captures?: PayPalCaptureDetails[];
    authorizations?: unknown[];
  };
}

export interface PayPalLinkDescription {
  href: string;
  rel: string;
  method: string;
}

export interface PayPalOrderResponse {
  id: string;
  status: PayPalOrderStatus;
  intent: PayPalOrderIntent;
  purchase_units: PayPalPurchaseUnit[];
  create_time?: string;
  update_time?: string;
  links: PayPalLinkDescription[];
}

export interface PayPalCaptureResponse {
  id: string;
  status: PayPalOrderStatus;
  purchase_units: PayPalPurchaseUnit[];
  links?: PayPalLinkDescription[];
}

export interface CreateOrderData {
  agentId: string;
  amount: number;
  currency: string;
  recipient: {
    email: string;
    name?: string;
    merchantId?: string;
  };
  description: string;
  intent?: PayPalOrderIntent;
  referenceId?: string;
}

export interface CreateOrderOptions {
  requestId: string;
  purchaseData: CreateOrderData;
}

export interface CaptureOrderOptions {
  orderId: string;
  requestId: string;
  expectedAmount?: number;
  expectedCurrency?: string;
  expectedRecipientEmail?: string;
  expectedReferenceId?: string;
}

export interface OrderReconciliationResult {
  isReconciled: boolean;
  orderId: string;
  status: PayPalOrderStatus;
  captureStatus?:
    | 'COMPLETED'
    | 'PENDING'
    | 'DECLINED'
    | 'FAILED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'NONE';
  captureId?: string;
  amount: number;
  currency: string;
  recipientEmail?: string;
  referenceId?: string;
  discrepancies: string[];
  reconciledAt: string;
}

export interface IPayPalClient {
  isConfigured(): boolean;
  getAccessToken(forceRefresh?: boolean): Promise<string>;
  createOrder(options: CreateOrderOptions): Promise<PayPalOrderResponse>;
  getOrder(orderId: string): Promise<PayPalOrderResponse>;
  captureOrder(options: CaptureOrderOptions): Promise<PayPalCaptureResponse>;
  reconcileOrder(
    orderId: string,
    expectedContext?: {
      amount?: number;
      currency?: string;
      recipientEmail?: string;
      referenceId?: string;
    }
  ): Promise<OrderReconciliationResult>;
}

export interface IPayPalSandboxAdapter {
  isConfigured(): boolean;
  verifyCredentials(): Promise<boolean>;
  createOrder(request: PaymentOrderRequest, requestId: string): Promise<PayPalOrderResponse>;
  getOrderDetails(orderId: string): Promise<PayPalOrderResponse>;
  reconcileOrder(
    orderId: string,
    expectedContext?: {
      amount?: number;
      currency?: string;
      recipientEmail?: string;
      referenceId?: string;
    }
  ): Promise<OrderReconciliationResult>;
  executePayment(
    request: PaymentOrderRequest,
    requestId: string,
    preApprovedOrderId?: string
  ): Promise<PaymentExecutionResult>;
}
