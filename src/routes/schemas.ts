import { z } from 'zod';

export const scanRequestSchema = z.object({
  input: z.string().min(1, 'Input text cannot be empty'),
  agentId: z.string().optional(),
});

export const policyEvaluationRequestSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  amount: z.number().positive('amount must be a positive number'),
  currency: z.string().length(3, 'currency must be a 3-letter ISO code'),
  recipient: z.object({
    email: z.string().email('recipient email must be a valid email address'),
    name: z.string().optional(),
    merchantId: z.string().optional(),
  }),
  description: z.string().min(1, 'description is required'),
  humanApprovalToken: z.string().optional(),
});

export const paymentInitiateRequestSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  amount: z.number().positive('amount must be a positive number'),
  currency: z.string().length(3, 'currency must be a 3-letter ISO code'),
  recipient: z.object({
    email: z.string().email('recipient email must be a valid email address'),
    name: z.string().optional(),
    merchantId: z.string().optional(),
  }),
  description: z.string().min(1, 'description is required'),
  promptContext: z.string().optional(),
  humanApprovalToken: z.string().optional(),
  intent: z.enum(['CAPTURE', 'AUTHORIZE']).optional(),
  metadata: z.record(z.unknown()).optional(),
  dryRun: z.boolean().optional(),
  orderId: z.string().optional(),
});

export const createOrderRequestSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  amount: z.number().positive('amount must be a positive number'),
  currency: z.string().length(3, 'currency must be a 3-letter ISO code'),
  recipient: z.object({
    email: z.string().email('recipient email must be a valid email address'),
    name: z.string().optional(),
    merchantId: z.string().optional(),
  }),
  description: z.string().min(1, 'description is required'),
  promptContext: z.string().optional(),
  intent: z.enum(['CAPTURE', 'AUTHORIZE']).optional(),
});

export const captureOrderRequestSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  amount: z.number().positive('amount must be a positive number'),
  currency: z.string().length(3, 'currency must be a 3-letter ISO code'),
  recipient: z.object({
    email: z.string().email('recipient email must be a valid email address'),
    name: z.string().optional(),
    merchantId: z.string().optional(),
  }),
  description: z.string().optional().default('Payment capture execution'),
  promptContext: z.string().optional(),
  humanApprovalToken: z.string().optional(),
});

export const riskAnalysisRequestSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  intendedPurchase: z.string().min(1, 'intendedPurchase is required'),
  expectedAmount: z.union([z.number().positive(), z.string().min(1)]),
  expectedCurrency: z.string().length(3, 'expectedCurrency must be a 3-letter ISO code'),
  expectedMerchant: z.string().min(1, 'expectedMerchant is required'),
  productPageText: z.string().optional(),
  toolResultText: z.string().optional(),
  policyVersion: z.union([z.number(), z.string()]).default(1),
  requireRiskAnalysis: z.boolean().default(false),
});

export type ScanRequestBody = z.infer<typeof scanRequestSchema>;
export type PolicyEvaluationRequestBody = z.infer<typeof policyEvaluationRequestSchema>;
export type PaymentInitiateRequestBody = z.infer<typeof paymentInitiateRequestSchema>;
export type CreateOrderRequestBody = z.infer<typeof createOrderRequestSchema>;
export type CaptureOrderRequestBody = z.infer<typeof captureOrderRequestSchema>;
export type RiskAnalysisRequestBody = z.infer<typeof riskAnalysisRequestSchema>;
