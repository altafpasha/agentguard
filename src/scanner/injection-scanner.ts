import { ScanFinding, ScanResult, ThreatLevel } from './types';
import { INJECTION_RULES } from './patterns';

// Regex for zero-width / invisible unicode characters commonly used for evasion
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00A0\u2000-\u200A\u2028\u2029]/g;

// Regex for Base64 blocks (at least 20 chars of valid base64)
const BASE64_PATTERN = /\b(?:[A-Za-z0-9+/]{4}){5,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\b/g;

export class InjectionScanner {
  private rules = INJECTION_RULES;
  private threatThreshold = 0.5;

  constructor(customThreshold = 0.5) {
    this.threatThreshold = customThreshold;
  }

  /**
   * Scan an input prompt/context string for adversarial injection patterns
   */
  public scan(input: string | undefined | null): ScanResult {
    const startTime = performance.now();

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return {
        isThreatDetected: false,
        riskScore: 0.0,
        threatLevel: 'NONE',
        findings: [],
        sanitizedInput: '',
        scanDurationMs: Number((performance.now() - startTime).toFixed(2)),
      };
    }

    const findings: ScanFinding[] = [];
    let accumulatedScore = 0.0;

    // Step 1: Detect and sanitize zero-width / invisible obfuscation characters
    // Stripping invisible characters restores words like "I\u200Bg\u200Bn\u200Bo\u200Br\u200Be" -> "Ignore"
    const sanitized = input.replace(ZERO_WIDTH_REGEX, '');
    const hasZeroWidthChars = sanitized.length !== input.length;

    if (hasZeroWidthChars) {
      findings.push({
        ruleId: 'OBF-001',
        name: 'Zero-Width / Invisible Character Obfuscation',
        category: 'OBFUSCATION',
        severity: 'MEDIUM',
        description: 'Input contains zero-width or invisible Unicode characters often used to evade pattern detection filters.',
        matchedSnippet: '[Invisible characters stripped]',
      });
      accumulatedScore += 0.35;
    }

    // Step 2: Check for embedded Base64 payloads and decode them for inspection
    const base64Matches = input.match(BASE64_PATTERN);
    let decodedBase64Combined = '';
    if (base64Matches) {
      for (const b64 of base64Matches) {
        try {
          const decoded = Buffer.from(b64, 'base64').toString('utf8');
          // Check if decoded content looks like printable text
          if (/^[\x20-\x7E\s]+$/.test(decoded) && decoded.length > 8) {
            decodedBase64Combined += ' ' + decoded;
          }
        } catch {
          // Not valid base64 or unparseable, ignore
        }
      }
    }

    // Step 3: Evaluate curated rules against normalized input and decoded base64
    const textsToEvaluate = [
      { text: sanitized, source: 'raw' },
      { text: decodedBase64Combined, source: 'base64_decoded' },
    ];

    for (const { text, source } of textsToEvaluate) {
      if (!text.trim()) continue;

      for (const rule of this.rules) {
        const match = rule.regex.exec(text);
        if (match) {
          // Avoid duplicate rule findings
          if (!findings.some((f) => f.ruleId === rule.id)) {
            const snippet = match[0].length > 80 ? `${match[0].slice(0, 77)}...` : match[0];
            findings.push({
              ruleId: rule.id,
              name: rule.name,
              category: rule.category,
              severity: rule.severity,
              description: rule.description,
              matchedSnippet: source === 'base64_decoded' ? `[Base64 Decoded] ${snippet}` : snippet,
            });
            accumulatedScore += rule.weight;
          }
        }
      }
    }

    // Calculate clamped risk score (0.0 to 1.0)
    const riskScore = Math.min(1.0, Number(accumulatedScore.toFixed(3)));

    // Determine threat level
    let threatLevel: ThreatLevel = 'NONE';
    if (riskScore >= 0.8) {
      threatLevel = 'CRITICAL';
    } else if (riskScore >= 0.5) {
      threatLevel = 'HIGH';
    } else if (riskScore >= 0.25) {
      threatLevel = 'MEDIUM';
    } else if (riskScore > 0.0) {
      threatLevel = 'LOW';
    }

    const isThreatDetected = riskScore >= this.threatThreshold || threatLevel === 'CRITICAL' || threatLevel === 'HIGH';

    const endTime = performance.now();
    return {
      isThreatDetected,
      riskScore,
      threatLevel,
      findings,
      sanitizedInput: sanitized,
      scanDurationMs: Number((endTime - startTime).toFixed(2)),
    };
  }
}

// Default singleton scanner instance
export const defaultScanner = new InjectionScanner();
