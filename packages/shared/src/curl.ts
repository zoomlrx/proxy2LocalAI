import type { HttpMethod } from "./profile";

export interface ParsedCurl {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}

export function parseCurlCommand(curlCommand: string): ParsedCurl {
  const tokens = tokenizeCurl(curlCommand);
  if (tokens[0]?.toLowerCase() === "curl") {
    tokens.shift();
  }

  let url: string | undefined;
  let method: HttpMethod | undefined;
  let hasBody = false;
  const headers: Record<string, string> = {};
  let body: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;

    if (token === "-X" || token === "--request") {
      const next = tokens[index + 1];
      if (next) {
        method = normalizeCurlMethod(next);
        index += 1;
      }
      continue;
    }
    if (token.startsWith("-X") && token.length > 2) {
      method = normalizeCurlMethod(token.slice(2));
      continue;
    }
    if (token === "--url") {
      url = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === "-H" || token === "--header") {
      const headerValue = tokens[index + 1];
      if (headerValue) {
        const colonIndex = headerValue.indexOf(":");
        if (colonIndex > 0) {
          const name = headerValue.slice(0, colonIndex).trim().toLowerCase();
          const value = headerValue.slice(colonIndex + 1).trim();
          headers[name] = value;
        }
        index += 1;
      }
      continue;
    }
    if (isBodyFlag(token)) {
      hasBody = true;
      if (token.includes("=")) {
        const equalIndex = token.indexOf("=");
        body = token.slice(equalIndex + 1);
      } else {
        body = tokens[index + 1];
        index += 1;
      }
      continue;
    }
    if (flagConsumesNextValue(token)) {
      index += 1;
      continue;
    }
    if (!token.startsWith("-") && looksLikeUrl(token)) {
      url = token;
    }
  }

  if (!url) {
    throw new Error("cURL 中未找到 URL");
  }

  return {
    url,
    method: method ?? (hasBody ? "POST" : "GET"),
    headers,
    body
  };
}

function tokenizeCurl(input: string): string[] {
  const normalized = input.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (const char of normalized) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function normalizeCurlMethod(value: string): HttpMethod {
  const method = value.toUpperCase();
  if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return method;
  }
  throw new Error(`不支持的 cURL HTTP 方法: ${value}`);
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isBodyFlag(token: string): boolean {
  return token === "-d"
    || token === "--data"
    || token === "--data-raw"
    || token === "--data-binary"
    || token === "--data-urlencode"
    || token === "--json"
    || token.startsWith("--data=")
    || token.startsWith("--data-raw=")
    || token.startsWith("--data-binary=")
    || token.startsWith("--data-urlencode=")
    || token.startsWith("--json=");
}

function flagConsumesNextValue(token: string): boolean {
  return token === "-A"
    || token === "--user-agent"
    || token === "-u"
    || token === "--user"
    || token === "-b"
    || token === "--cookie"
    || token === "-o"
    || token === "--output";
}
