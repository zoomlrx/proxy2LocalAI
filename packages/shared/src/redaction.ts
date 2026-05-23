const SENSITIVE_HEADERS = ["authorization", "cookie", "set-cookie", "x-api-key", "x-proxy2localai-token"];

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+\S+/gi, replacement: "Bearer [REDACTED]" },
  { pattern: /token[=:]\s*\S+/gi, replacement: "token=[REDACTED]" },
  { pattern: /api[_-]?key[=:]\s*\S+/gi, replacement: "api_key=[REDACTED]" },
  { pattern: /secret[=:]\s*\S+/gi, replacement: "secret=[REDACTED]" },
  { pattern: /password[=:]\s*\S+/gi, replacement: "password=[REDACTED]" },
  { pattern: /cookie[=:]\s*\S+/gi, replacement: "cookie=[REDACTED]" }
];

export function redactDiagnosticText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADERS.includes(lower)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
