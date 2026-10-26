import { ScannerRule } from './types';

export const INJECTION_RULES: ScannerRule[] = [
  // 1. Instruction Overrides & Goal Hijacking
  {
    id: 'INJ-001',
    name: 'Instruction Override',
    category: 'INSTRUCTION_OVERRIDE',
    severity: 'CRITICAL',
    description: 'Attempt to force the agent to ignore, disregard, or bypass prior instructions or constraints.',
    regex: /(?:ignore|disregard|forget|bypass|override|drop)\s+(?:all\s+)?(?:previous|prior|above|existing|system|buyer)?\s*(?:\w+\s+)?(?:instructions|rules|prompts|commands|guidelines|constraints|safety\s+checks|limits)/i,
    weight: 0.85,
  },
  {
    id: 'INJ-002',
    name: 'New Persona / Unrestricted Instruction',
    category: 'INSTRUCTION_OVERRIDE',
    severity: 'HIGH',
    description: 'Command declaring that new instructions supersede prior guidance.',
    regex: /(?:from\s+now\s+on|starting\s+now|henceforth)[,\s]+(?:you\s+must|you\s+are|act\s+as|obey|respond\s+without\s+restrictions)/i,
    weight: 0.65,
  },

  // 2. Jailbreak and Developer Mode Evasion
  {
    id: 'INJ-003',
    name: 'Jailbreak Persona (DAN / Uncensored)',
    category: 'JAILBREAK_EVASION',
    severity: 'CRITICAL',
    description: 'Attempts to invoke known jailbreak personas such as DAN, AIM, or developer mode.',
    regex: /\b(?:DAN\s+mode|do\s+anything\s+now|developer\s+mode\s+enabled|unrestricted\s+mode|jailbroken|evil\s+twin\s+mode)\b/i,
    weight: 0.9,
  },
  {
    id: 'INJ-004',
    name: 'Hypothetical / Roleplay Policy Bypass',
    category: 'JAILBREAK_EVASION',
    severity: 'HIGH',
    description: 'Attempts to frame prohibited financial actions within hypothetical, fiction, or roleplay scenarios.',
    regex: /(?:in\s+this\s+hypothetical\s+scenario|pretend\s+there\s+are\s+no\s+rules|for\s+educational\s+purposes\s+only[,\s]+bypass|pretend\s+you\s+are\s+authorized\s+to\s+pay)/i,
    weight: 0.6,
  },

  // 3. System Prompt and Secret Exfiltration
  {
    id: 'INJ-005',
    name: 'System Prompt Exfiltration',
    category: 'SYSTEM_PROMPT_EXFILTRATION',
    severity: 'HIGH',
    description: 'Attempts to leak system instructions, secret keys, or internal configuration.',
    regex: /(?:repeat|print|reveal|output|display|show|dump)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|secret\s+key|internal\s+configuration|api\s+keys|paypal\s+credentials)/i,
    weight: 0.7,
  },

  // 4. Delimiter Spoofing & Tag Injection
  {
    id: 'INJ-006',
    name: 'System Delimiter Spoofing',
    category: 'DELIMITER_SPOOFING',
    severity: 'CRITICAL',
    description: 'Fakes system, human, or assistant markup tags to inject authoritative commands.',
    regex: /<\/?(?:system|instruction|admin|override|authorization|trusted_prompt)>/i,
    weight: 0.85,
  },
  {
    id: 'INJ-007',
    name: 'Bracketed System Command Injection',
    category: 'DELIMITER_SPOOFING',
    severity: 'HIGH',
    description: 'Injects bracketed pseudo-system directives like [SYSTEM: ...] or [OVERRIDE: ...].',
    regex: /\[(?:SYSTEM|ADMIN|INTERNAL|OVERRIDE|SECURITY_CLEARANCE)[\s\w:]*\]/i,
    weight: 0.75,
  },

  // 5. Financial Hijacking & Authority Impersonation
  {
    id: 'INJ-008',
    name: 'Unauthorized Payment Authorization Claim',
    category: 'FINANCIAL_HIJACKING',
    severity: 'CRITICAL',
    description: 'Falsely asserts high-level administrative or executive authorization to force payment approval.',
    regex: /(?:approved\s+by\s+(?:CEO|CFO|executive|admin)|urgent\s+wire\s+transfer|emergency\s+payment\s+override|bypass\s+spending\s+limit|drain\s+all\s+funds)/i,
    weight: 0.8,
  },
  {
    id: 'INJ-009',
    name: 'Recipient Redirection / Exfiltration',
    category: 'FINANCIAL_HIJACKING',
    severity: 'HIGH',
    description: 'Instructs the agent to send funds to an alternate or attacker-controlled address silently.',
    regex: /(?:send|transfer|forward|redirect|divert)\s+(?:the\s+)?(?:funds|money|payment|balance|transaction)?\s*(?:instead\s+to|silently\s+to|secretly\s+to|to\s+my\s+personal\s+paypal|to\s+(?:an?\s+)?(?:alternate|offshore|another|attacker|personal|unauthorized|new)\s+(?:account|address|payee|wallet|recipient|email)|to\s+\S+@\S+)/i,
    weight: 0.75,
  },

  // 6. Delimiter Escape Sequence
  {
    id: 'INJ-010',
    name: 'Multi-line Delimiter Escape',
    category: 'DELIMITER_SPOOFING',
    severity: 'MEDIUM',
    description: 'Uses markdown dividers or markdown fences to reset context.',
    regex: /(?:---|===|___)\s*\n+\s*(?:System|Admin|User|Assistant):/i,
    weight: 0.5,
  },
];
