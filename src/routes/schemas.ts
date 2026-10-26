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
});

export type ScanRequestBody = z.infer<typeof scanRequestSchema>;
export type PolicyEvaluationRequestBody = z.infer<typeof policyEvaluationRequestSchema>;
export type PaymentInitiateRequestBody = z.infer<typeof paymentInitiateRequestSchema>;
