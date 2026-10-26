export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface OpenRouterChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SemanticAnalysisResult {
  isAdvisoryAnomalyDetected: boolean;
  confidenceScore: number; // 0.0 to 1.0
  intentCategory: string;
  summary: string;
  riskSignals: string[];
  /**
   * Explanatory disclaimer: AI evaluation is strictly advisory and NEVER authoritative
   * for payment authorization.
   */
  authorizationAuthorityDisclaimer: string;
}
