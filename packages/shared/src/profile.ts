export const DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:39399";
export const DEFAULT_LOCAL_TOKEN = "proxy2localai-local-token";
export const DEFAULT_TIMEOUT_MS = 0;
export const DEFAULT_MAX_BODY_BYTES = 0;

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export const AI_PROVIDERS = ["claude", "codex", "custom"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

export const RESPONSE_MODES = ["block", "stream", "custom_json"] as const;
export type ResponseMode = typeof RESPONSE_MODES[number];

export interface ProxyProfile {
  id: string;
  name: string;
  enabled: boolean;
  targetOrigin: string;
  targetPath: string;
  methods: HttpMethod[];
  projectDir: string;
  provider: AiProvider;
  responseMode: ResponseMode;
  prompt?: string;
  timeoutMs: number;
  maxBodyBytes: number;
  customCommand?: string;
  customArgs?: string[];
  customJsonTemplate?: string;
  sseDataEvents: string[];
}

export interface AppConfig {
  bridgeBaseUrl: string;
  token: string;
  profiles: ProxyProfile[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, fieldName: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是对象`);
  }
  return value as UnknownRecord;
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} 必须是非空字符串`);
  }
  return value.trim();
}

function asOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} 必须是字符串`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeOrigin(value: unknown): string {
  const raw = asString(value, "targetOrigin");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("targetOrigin 必须是合法 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("targetOrigin 只支持 http 或 https");
  }
  return url.origin;
}

function normalizePath(value: unknown): string {
  const path = asString(value, "targetPath");
  if (!path.startsWith("/")) {
    throw new Error("targetPath 必须以 / 开头");
  }
  return path;
}

function normalizeMethods(value: unknown): HttpMethod[] {
  if (value === undefined || value === null) {
    return ["POST"];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("methods 必须是非空数组");
  }
  const methods = Array.from(new Set(value.map((method) => {
    if (typeof method !== "string") {
      throw new Error("methods 只能包含字符串");
    }
    const upper = method.toUpperCase();
    if (!HTTP_METHODS.includes(upper as HttpMethod)) {
      throw new Error(`不支持的 HTTP 方法: ${method}`);
    }
    return upper as HttpMethod;
  })));
  return methods;
}

function normalizeProvider(value: unknown): AiProvider {
  if (value === undefined || value === null || value === "") {
    return "claude";
  }
  if (typeof value !== "string" || !AI_PROVIDERS.includes(value as AiProvider)) {
    throw new Error("provider 必须是 claude、codex 或 custom");
  }
  return value as AiProvider;
}

function normalizeResponseMode(value: unknown): ResponseMode {
  if (value === undefined || value === null || value === "") {
    return "block";
  }
  if (typeof value !== "string" || !RESPONSE_MODES.includes(value as ResponseMode)) {
    throw new Error("responseMode 必须是 block、stream 或 custom_json");
  }
  return value as ResponseMode;
}

function normalizePositiveInteger(value: unknown, fieldName: string, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} 必须是正整数`);
  }
  return parsed;
}

function normalizeNonNegativeInteger(value: unknown, fieldName: string, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} 必须是非负整数`);
  }
  return parsed;
}

function normalizeStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是字符串数组`);
  }
  return value.map((item) => asString(item, fieldName));
}

function normalizeEventNames(value: unknown): string[] {
  let raw: string[];
  if (value === undefined || value === null || value === "") {
    raw = ["message"];
  } else if (Array.isArray(value)) {
    raw = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  } else {
    raw = String(value).split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
  }

  const events = Array.from(new Set(raw));
  return events.length > 0 ? events : ["message"];
}

export function normalizeProfile(value: unknown): ProxyProfile {
  const input = asRecord(value, "profile");
  const id = asString(input.id, "id");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error("id 只能包含字母、数字、下划线和短横线，且最长 64 位");
  }

  return {
    id,
    name: asString(input.name, "name"),
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    targetOrigin: normalizeOrigin(input.targetOrigin),
    targetPath: normalizePath(input.targetPath),
    methods: normalizeMethods(input.methods),
    projectDir: asString(input.projectDir, "projectDir"),
    provider: normalizeProvider(input.provider),
    responseMode: normalizeResponseMode(input.responseMode),
    prompt: asOptionalString(input.prompt, "prompt"),
    timeoutMs: normalizeNonNegativeInteger(input.timeoutMs, "timeoutMs", DEFAULT_TIMEOUT_MS),
    maxBodyBytes: normalizeNonNegativeInteger(input.maxBodyBytes, "maxBodyBytes", DEFAULT_MAX_BODY_BYTES),
    customCommand: asOptionalString(input.customCommand, "customCommand"),
    customArgs: normalizeStringArray(input.customArgs, "customArgs"),
    customJsonTemplate: asOptionalString(input.customJsonTemplate, "customJsonTemplate"),
    sseDataEvents: normalizeEventNames(input.sseDataEvents)
  };
}

export function normalizeProfiles(values: unknown): ProxyProfile[] {
  if (!Array.isArray(values)) {
    throw new Error("profiles 必须是数组");
  }
  const seen = new Set<string>();
  return values.map((value) => {
    const profile = normalizeProfile(value);
    if (seen.has(profile.id)) {
      throw new Error(`profile id 重复: ${profile.id}`);
    }
    seen.add(profile.id);
    return profile;
  });
}

export function normalizeConfig(value: unknown): AppConfig {
  const input = asRecord(value, "config");
  return {
    bridgeBaseUrl: asOptionalString(input.bridgeBaseUrl, "bridgeBaseUrl") ?? DEFAULT_BRIDGE_BASE_URL,
    token: asOptionalString(input.token, "token") ?? DEFAULT_LOCAL_TOKEN,
    profiles: normalizeProfiles(input.profiles ?? [])
  };
}

export function createEmptyConfig(): AppConfig {
  return {
    bridgeBaseUrl: DEFAULT_BRIDGE_BASE_URL,
    token: DEFAULT_LOCAL_TOKEN,
    profiles: []
  };
}
