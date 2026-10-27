import dotenv from 'dotenv';

dotenv.config();

export interface ConsumerConfig {
  agentGuardBaseUrl: string;
  agentGuardApiKey: string;
  timeoutMs: number;
}

export function loadConfig(): ConsumerConfig {
  const agentGuardBaseUrl = process.env.AGENTGUARD_BASE_URL || 'http://localhost:3001';
  const agentGuardApiKey = process.env.AGENTGUARD_API_KEY;

  if (!agentGuardApiKey) {
    throw new Error(
      'Missing required environment variable: AGENTGUARD_API_KEY. ' +
      'Please configure a valid AgentGuard API key in your environment or .env file.'
    );
  }

  const timeoutMs = process.env.AGENTGUARD_TIMEOUT_MS
    ? parseInt(process.env.AGENTGUARD_TIMEOUT_MS, 10)
    : 10000;

  return {
    agentGuardBaseUrl,
    agentGuardApiKey,
    timeoutMs,
  };
}
