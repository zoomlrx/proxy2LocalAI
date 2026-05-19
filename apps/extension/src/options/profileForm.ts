import {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_TIMEOUT_MS,
  normalizeProfile,
  type AiProvider,
  type HttpMethod,
  type ProxyProfile,
  type ResponseMode
} from "@proxy2localai/shared";

export interface ProfileDraft {
  id: string;
  name: string;
  enabled: boolean;
  targetOrigin: string;
  targetPath: string;
  methods: HttpMethod[];
  projectDir: string;
  provider: AiProvider;
  responseMode: ResponseMode;
  prompt: string;
  timeoutMs: number;
  maxBodyBytes: number;
  customCommand: string;
  customArgs: string;
  customJsonTemplate: string;
  sseDataEvents: string;
}

export function createBlankProfile(projectDir = ""): ProfileDraft {
  return {
    id: `profile-${Date.now().toString(36)}`,
    name: "新代理",
    enabled: true,
    targetOrigin: "https://api.example.com",
    targetPath: "/v1/chat/completions",
    methods: ["POST"],
    projectDir,
    provider: "claude",
    responseMode: "block",
    prompt: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    customCommand: "",
    customArgs: "",
    customJsonTemplate: "",
    sseDataEvents: "message"
  };
}

export function profileToDraft(profile: ProxyProfile): ProfileDraft {
  return {
    ...profile,
    prompt: profile.prompt ?? "",
    customCommand: profile.customCommand ?? "",
    customArgs: profile.customArgs?.join("\n") ?? "",
    customJsonTemplate: profile.customJsonTemplate ?? "",
    sseDataEvents: profile.sseDataEvents?.join("\n") ?? "message"
  };
}

export function draftToProfile(draft: ProfileDraft): ProxyProfile {
  return normalizeProfile({
    ...draft,
    prompt: draft.prompt || undefined,
    customCommand: draft.customCommand || undefined,
    customArgs: draft.customArgs
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    customJsonTemplate: draft.customJsonTemplate || undefined,
    sseDataEvents: draft.sseDataEvents
      .split(/[\r\n,]+/)
      .map((line) => line.trim())
      .filter(Boolean)
  });
}

export function applyCurlToDraft(draft: ProfileDraft, curlCommand: string): ProfileDraft {
  const parsed = parseCurlCommand(curlCommand);
  const url = new URL(parsed.url);
  const targetPath = url.pathname || "/";
  return {
    ...draft,
    name: `${url.hostname}${targetPath}`,
    targetOrigin: url.origin,
    targetPath,
    methods: [parsed.method]
  };
}

function parseCurlCommand(curlCommand: string): { url: string; method: HttpMethod } {
  const tokens = tokenizeCurl(curlCommand);
  if (tokens[0]?.toLowerCase() === "curl") {
    tokens.shift();
  }

  let url: string | undefined;
  let method: HttpMethod | undefined;
  let hasBody = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
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
    if (isBodyFlag(token)) {
      hasBody = true;
      if (!token.includes("=")) {
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
    method: method ?? (hasBody ? "POST" : "GET")
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
  return token === "-H"
    || token === "--header"
    || token === "-A"
    || token === "--user-agent"
    || token === "-u"
    || token === "--user"
    || token === "-b"
    || token === "--cookie"
    || token === "-o"
    || token === "--output";
}
