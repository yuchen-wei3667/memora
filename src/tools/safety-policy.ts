export interface SafetyPolicyInput {
  scriptContent: string;
  allowNetwork: boolean;
}

export interface SafetyPolicyResult {
  allowed: boolean;
  reasons: string[];
}

const riskyPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+-rf\s+\//,
    reason: "blocked: recursive root delete"
  },
  {
    pattern: /\bmkfs\b|\bdd\s+if=/,
    reason: "blocked: destructive disk command"
  },
  {
    pattern: /\bshutdown\b|\breboot\b/,
    reason: "blocked: host power command"
  }
];

const networkPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bcurl\b/, reason: "requires network: curl" },
  { pattern: /\bwget\b/, reason: "requires network: wget" },
  { pattern: /\bnc\b|\bnetcat\b/, reason: "requires network: netcat" }
];

export const evaluateSafetyPolicy = (
  input: SafetyPolicyInput
): SafetyPolicyResult => {
  const reasons: string[] = [];

  for (const rule of riskyPatterns) {
    if (rule.pattern.test(input.scriptContent)) {
      reasons.push(rule.reason);
    }
  }

  if (!input.allowNetwork) {
    for (const rule of networkPatterns) {
      if (rule.pattern.test(input.scriptContent)) {
        reasons.push(rule.reason);
      }
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
};
