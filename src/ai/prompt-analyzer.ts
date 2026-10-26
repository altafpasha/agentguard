import { OpenRouterClient } from './client';
import { SemanticAnalysisResult } from './types';
import { PaymentOrderRequest } from '../common/types';

export class SemanticPromptAnalyzer {
  private client: OpenRouterClient;

  constructor(client: OpenRouterClient) {
    this.client = client;
  }

  /**
   * Perform semantic risk analysis on the payment context and prompt.
   *
   * IMPORTANT ARCHITECTURAL CONSTRAINT:
   * The output of this method is STRICTLY ADVISORY. Under no circumstances
   * can this analysis authorize a payment or override deterministic policy rules.
   */
  public async analyzePaymentIntent(
    request: PaymentOrderRequest
  ): Promise<SemanticAnalysisResult> {
    const disclaimer =
      'NON-AUTHORITATIVE: Semantic AI risk score is purely advisory and cannot override deterministic policy engine rules.';

    // Fast-path heuristic if AI client is in placeholder/mock mode
    if (!this.client.isConfigured()) {
      return {
        isAdvisoryAnomalyDetected: false,
        confidenceScore: 0.95,
        intentCategory: 'STANDARD_PURCHASE',
        summary: `Payment for '${request.description}' of ${request.amount} ${request.currency} to ${request.recipient.email}`,
        riskSignals: [],
        authorizationAuthorityDisclaimer: disclaimer,
      };
    }

    const systemPrompt = `You are a specialized security analyzer for payment gateway requests.
Analyze the following agent payment request for suspicious semantic intent, coercion, or financial fraud indicators.
Respond strictly in JSON format with the following keys:
{
  "isAnomaly": boolean,
  "confidence": number between 0.0 and 1.0,
  "category": string (e.g. "STANDARD_PURCHASE", "SUSPICIOUS_URGENCY", "POTENTIAL_FRAUD"),
  "summary": string,
  "riskSignals": string[]
}`;

    const userContent = JSON.stringify({
      agentId: request.agentId,
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipient,
      description: request.description,
      promptContext: request.promptContext ?? 'None provided',
    });

    try {
      const response = await this.client.createChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ]);

      const content = response.choices[0]?.message.content ?? '{}';
      // Strip markdown code fences if present
      const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        isAdvisoryAnomalyDetected: Boolean(parsed.isAnomaly),
        confidenceScore: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        intentCategory: String(parsed.category || 'UNKNOWN'),
        summary: String(parsed.summary || request.description),
        riskSignals: Array.isArray(parsed.riskSignals) ? parsed.riskSignals.map(String) : [],
        authorizationAuthorityDisclaimer: disclaimer,
      };
    } catch {
      // In case of AI provider network issue, fail safely to an advisory warning without halting gateway
      return {
        isAdvisoryAnomalyDetected: false,
        confidenceScore: 0.0,
        intentCategory: 'UNVERIFIED_AI_OFFLINE',
        summary: 'AI provider analysis unavailable; deterministic policy controls remain fully enforced.',
        riskSignals: ['AI_PROVIDER_UNREACHABLE'],
        authorizationAuthorityDisclaimer: disclaimer,
      };
    }
  }
}
