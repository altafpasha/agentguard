import { PaymentOrderRequest } from '../common/types';

export type PaymentExecutionStatus =
  | 'EXECUTION_NOT_ENABLED'
  | 'PENDING_APPROVAL'
  | 'REJECTED_POLICY'
  | 'REJECTED_INJECTION'
  | 'FAILED'
  | 'PAYPAL_API_PENDING';

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
  executionTimestamp: string;
  error?: string;
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'live';
  apiBaseUrl: string;
}

export interface IPayPalSandboxAdapter {
  isConfigured(): boolean;
  executePayment(request: PaymentOrderRequest, requestId: string): Promise<PaymentExecutionResult>;
  verifyCredentials(): Promise<boolean>;
}
