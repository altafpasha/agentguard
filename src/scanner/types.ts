import { ThreatLevel } from '../common/types';

export type { ThreatLevel };

export interface ScanFinding {
  ruleId: string;
  name: string;
  category: 'INSTRUCTION_OVERRIDE' | 'SYSTEM_PROMPT_EXFILTRATION' | 'JAILBREAK_EVASION' | 'DELIMITER_SPOOFING' | 'FINANCIAL_HIJACKING' | 'OBFUSCATION';
  severity: ThreatLevel;
  description: string;
  matchedSnippet?: string;
}

export interface ScanResult {
  isThreatDetected: boolean;
  riskScore: number; // 0.0 to 1.0
  threatLevel: ThreatLevel;
  findings: ScanFinding[];
  sanitizedInput: string;
  scanDurationMs: number;
}

export interface ScannerRule {
  id: string;
  name: string;
  category: ScanFinding['category'];
  severity: ThreatLevel;
  description: string;
  regex: RegExp;
  weight: number; // Contribution to riskScore (0.0 to 1.0)
}
