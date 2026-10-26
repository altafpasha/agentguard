import { ProductItem } from './catalog';
import { getConfig } from '../config';

export interface ShoppingAgentProposal {
  agentId: string;
  amount: number;
  currency: string;
  recipient: {
    email: string;
    name: string;
  };
  description: string;
  promptContext: string;
  reasoning: string;
  llmResponseRaw?: unknown;
}

export interface GatewayExecutionResponse {
  statusCode: number;
  data: unknown;
  headers: Record<string, string>;
  isBlocked: boolean;
  isHeld: boolean;
  isExecuted: boolean;
  orderId?: string;
  approvalId?: string;
  error?: string;
  message?: string;
  durationMs: number;
}

export class ScriptedShoppingAgent {
  public readonly agentId: string;
  private openRouterApiKey?: string;
  private openRouterModel: string;
  private gatewayBaseUrl: string;

  constructor(options: {
    agentId?: string;
    openRouterApiKey?: string;
    openRouterModel?: string;
    gatewayBaseUrl?: string;
  } = {}) {
    const config = getConfig();
    this.agentId = options.agentId ?? 'ai-shopping-agent-007';
    this.openRouterApiKey = options.openRouterApiKey ?? config.OPENROUTER_API_KEY;
    this.openRouterModel = options.openRouterModel ?? config.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
    this.gatewayBaseUrl = (options.gatewayBaseUrl ?? `http://127.0.0.1:${config.PORT}`).replace(/\/+$/, '');
  }

  /**
   * Propose a purchase for a given product and user intent.
   * Leverages OpenRouter to analyze the product page and formulate payment proposal.
   */
  public async proposePurchase(
    product: ProductItem,
    userIntent: string,
    overrideAgentId?: string
  ): Promise<ShoppingAgentProposal> {
    const activeAgentId = overrideAgentId ?? this.agentId;
    const systemPrompt = `You are an autonomous AI shopping agent.
Your objective:
1. Parse the user's shopping request and the provided product page content.
2. Formulate a structured payment proposal JSON matching this schema:
{
  "amount": number,
  "currency": "USD",
  "recipientEmail": string,
  "recipientName": string,
  "description": string,
  "reasoning": string,
  "promptContext": string
}

CRITICAL: Return ONLY valid JSON. No Markdown formatting, no code fences.`;

    const userPrompt = `User Request: "${userIntent}"

Product Page Content:
${product.pageContent}

Please formulate the payment proposal.`;

    // Attempt OpenRouter LLM call if configured
    if (this.openRouterApiKey && !this.openRouterApiKey.includes('placeholder')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'HTTP-Referer': 'https://agentguard.security',
            'X-Title': 'AgentGuard Shopping Agent',
          },
          body: JSON.stringify({
            model: this.openRouterModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            max_tokens: 450,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const json = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = json.choices?.[0]?.message?.content;
          if (content) {
            const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            const parsed = JSON.parse(cleaned);

            // If the product is malicious fixture, ensure the full untrusted context including injection is captured in promptContext
            const promptContext = product.isMaliciousFixture
              ? `${userIntent} \n ${product.pageContent}`
              : parsed.promptContext || `${userIntent} \n ${product.description}`;

            return {
              agentId: activeAgentId,
              amount: typeof parsed.amount === 'number' ? parsed.amount : product.price,
              currency: parsed.currency || product.currency,
              recipient: {
                email: parsed.recipientEmail || product.merchant.email,
                name: parsed.recipientName || product.merchant.name,
              },
              description: parsed.description || product.name,
              promptContext,
              reasoning: parsed.reasoning || `AI agent parsed catalog product ${product.id}`,
              llmResponseRaw: json,
            };
          }
        }
      } catch {
        // Fall back gracefully to structured heuristic
      }
    }

    // Heuristic structured proposal (Deterministic fallback or offline mode)
    return {
      agentId: activeAgentId,
      amount: product.price,
      currency: product.currency,
      recipient: {
        email: product.merchant.email,
        name: product.merchant.name,
      },
      description: product.name,
      promptContext: product.isMaliciousFixture
        ? `${userIntent} \n ${product.pageContent}`
        : `${userIntent} \n ${product.description}`,
      reasoning: `Structured shopping agent proposed purchase for item '${product.name}' ($${product.price.toFixed(2)} ${product.currency}).`,
    };
  }

  /**
   * Submit purchase proposal to AgentGuard Gateway
   */
  public async submitToGateway(
    proposal: ShoppingAgentProposal,
    customOptions: {
      humanApprovalToken?: string;
      orderId?: string;
      dryRun?: boolean;
      requestId?: string;
    } = {}
  ): Promise<GatewayExecutionResponse> {
    const startTime = performance.now();
    const endpoint = `${this.gatewayBaseUrl}/api/v1/payments/initiate`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (customOptions.requestId) {
      headers['x-request-id'] = customOptions.requestId;
    }

    const payload = {
      agentId: proposal.agentId,
      amount: proposal.amount,
      currency: proposal.currency,
      recipient: proposal.recipient,
      description: proposal.description,
      promptContext: proposal.promptContext,
      humanApprovalToken: customOptions.humanApprovalToken,
      orderId: customOptions.orderId,
      dryRun: customOptions.dryRun,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const durationMs = Math.round(performance.now() - startTime);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const statusCode = response.status;
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      data = { rawText: await response.text() };
    }

    const isBlocked = statusCode === 403;
    const isHeld = statusCode === 202;
    const isExecuted = statusCode === 200 && (data.executed === true || Boolean(data.paypalOrderId));

    const orderId = (data.paypalOrderId as string) || (data.orderId as string);
    const details = data.details as { approvalId?: string } | undefined;
    const approvalId = details?.approvalId;

    return {
      statusCode,
      data,
      headers: responseHeaders,
      isBlocked,
      isHeld,
      isExecuted,
      orderId,
      approvalId,
      error: data.error as string | undefined,
      message: data.message as string | undefined,
      durationMs,
    };
  }
}
