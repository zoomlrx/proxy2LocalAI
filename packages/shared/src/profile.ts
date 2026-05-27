import {
  cloneMappingSecurityPolicy,
  cloneStreamDoneEvent,
  cloneStreamDonePolicy,
  cloneToolEventPolicy,
  DEFAULT_MAPPING_SECURITY_POLICY,
  DEFAULT_STREAM_DONE_EVENT,
  DEFAULT_STREAM_DONE_POLICY,
  DEFAULT_TOOL_EVENT_POLICY,
  getDefaultStreamCodec,
  STREAM_EVENT_CHANNELS,
  STREAM_EVENT_KINDS,
  type MappingSecurityPolicy,
  type StreamCodecId,
  type StreamDoneEvent,
  type StreamDonePolicy,
  type StreamEventChannel,
  type StreamEventKind,
  type ToolEventPolicy
} from "./streamEvents";
import {
  legacySseMappingsToStreamMappings,
  type StreamMappingRule
} from "./streamMapping";

export {
  DEFAULT_MAPPING_SECURITY_POLICY,
  DEFAULT_STREAM_DONE_EVENT,
  DEFAULT_STREAM_DONE_POLICY,
  DEFAULT_TOOL_EVENT_POLICY
} from "./streamEvents";

export const DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:39399";
export const DEFAULT_LOCAL_TOKEN = "proxy2localai-local-token";
export const DEFAULT_TIMEOUT_MS = 0;
export const DEFAULT_MAX_BODY_BYTES = 0;
export const DEFAULT_CONTEXT_REGEX_FLAGS = "s";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export const AI_PROVIDERS = ["claude", "codex", "custom"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

export const RESPONSE_MODES = ["block", "stream", "custom_json", "mapped_sse"] as const;
export type ResponseMode = typeof RESPONSE_MODES[number];

export const MESSAGE_RETURN_STRUCTURES = [
  "anthropic_messages",
  "openai_chat_completions",
  "openai_responses",
  "gemini_generate_content"
] as const;
export type MessageReturnStructure = typeof MESSAGE_RETURN_STRUCTURES[number];
export const DEFAULT_MESSAGE_RETURN_STRUCTURE: MessageReturnStructure = "anthropic_messages";

export type SetupMode = "wizard" | "advanced";
export type SensitiveHeaderPolicy = "default" | "allow_all" | "custom";

export interface LastTestResult {
  ok: boolean;
  testedAt: string;
  stage: string;
  message: string;
}

export interface SseEventMapping {
  source: string;
  targetEvent: string;
}

export interface SseDoneEvent {
  targetEvent: string;
  data: unknown;
}

export const DEFAULT_SSE_EVENT_MAPPINGS: SseEventMapping[] = [
  { source: "reasoning", targetEvent: "reasoning" },
  { source: "message", targetEvent: "message" }
];

export const DEFAULT_SSE_DONE_EVENT: SseDoneEvent = {
  targetEvent: "done",
  data: {
    conversationId: "",
    status: "completed",
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0
  }
};

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
  messageReturnStructure: MessageReturnStructure;
  allowDangerousCli: boolean;
  enableConversationMemory: boolean;
  prompt?: string;
  timeoutMs: number;
  maxBodyBytes: number;
  contextRegex?: string;
  contextRegexFlags: string;
  providerArgs?: string[];
  customCommand?: string;
  customArgs?: string[];
  customJsonTemplate?: string;
  sseDataEvents: string[];
  sseEventMappings?: SseEventMapping[];
  sseDoneEvent?: SseDoneEvent;
  streamCodec?: StreamCodecId;
  streamMappings?: StreamMappingRule[];
  streamDoneEvent?: StreamDoneEvent;
  toolEventPolicy?: ToolEventPolicy;
  mappingSecurityPolicy?: MappingSecurityPolicy;
  streamDonePolicy?: StreamDonePolicy;
  setupMode: SetupMode;
  responseTemplateId: string;
  sensitiveHeaderPolicy: SensitiveHeaderPolicy;
  debugEnabled: boolean;
  lastTestResult?: LastTestResult;
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
    throw new Error("responseMode 必须是 block、stream、custom_json 或 mapped_sse");
  }
  return value as ResponseMode;
}

function normalizeMessageReturnStructure(value: unknown): MessageReturnStructure {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_MESSAGE_RETURN_STRUCTURE;
  }
  if (typeof value !== "string" || !MESSAGE_RETURN_STRUCTURES.includes(value as MessageReturnStructure)) {
    throw new Error("messageReturnStructure 必须是受支持的消息返回结构");
  }
  return value as MessageReturnStructure;
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

function normalizeBoolean(value: unknown, fieldName: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  throw new Error(`${fieldName} 必须是布尔值`);
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

function normalizeRegexFlags(value: unknown): string {
  const flags = asOptionalString(value, "contextRegexFlags") ?? DEFAULT_CONTEXT_REGEX_FLAGS;
  if (!/^[dgimsuy]*$/.test(flags)) {
    throw new Error("contextRegexFlags 只能包含 d、g、i、m、s、u、y");
  }
  if (new Set(flags).size !== flags.length) {
    throw new Error("contextRegexFlags 不能包含重复标记");
  }
  return flags;
}

function normalizeContextRegex(value: unknown, flags: string): string | undefined {
  const pattern = asOptionalString(value, "contextRegex");
  if (!pattern) {
    return undefined;
  }
  try {
    new RegExp(pattern, flags);
  } catch (error) {
    throw new Error(`contextRegex 不是合法正则: ${error instanceof Error ? error.message : String(error)}`);
  }
  return pattern;
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

function validateSseEventName(value: string, fieldName: string): string {
  const name = value.trim();
  if (!name || /[\r\n]/.test(name)) {
    throw new Error(`${fieldName} 必须是非空且不包含换行的 SSE 事件名`);
  }
  return name;
}

function cloneDefaultSseDoneEvent(): SseDoneEvent {
  return {
    targetEvent: DEFAULT_SSE_DONE_EVENT.targetEvent,
    data: JSON.parse(JSON.stringify(DEFAULT_SSE_DONE_EVENT.data)) as unknown
  };
}

function normalizeSseEventMappings(value: unknown): SseEventMapping[] {
  const rawMappings: SseEventMapping[] = [];
  const parseMappingText = (text: string): SseEventMapping => {
    const parts = text.split("=").map((item) => item.trim());
    const source = validateSseEventName(parts[0] ?? "", "sseEventMappings.source");
    const targetEvent = validateSseEventName(parts[1] ?? source, "sseEventMappings.targetEvent");
    return { source, targetEvent };
  };
  if (value === undefined || value === null || value === "") {
    rawMappings.push(...DEFAULT_SSE_EVENT_MAPPINGS);
  } else if (typeof value === "string") {
    for (const line of value.split(/[\r\n,]+/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      rawMappings.push(parseMappingText(trimmed));
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        rawMappings.push(parseMappingText(item));
        continue;
      }
      const record = asRecord(item, "sseEventMappings");
      rawMappings.push({
        source: validateSseEventName(asString(record.source, "sseEventMappings.source"), "sseEventMappings.source"),
        targetEvent: validateSseEventName(asString(record.targetEvent ?? record.target, "sseEventMappings.targetEvent"), "sseEventMappings.targetEvent")
      });
    }
  } else {
    throw new Error("sseEventMappings 必须是数组或文本配置");
  }

  const seen = new Set<string>();
  const mappings = rawMappings.filter((mapping) => {
    if (seen.has(mapping.source)) {
      return false;
    }
    seen.add(mapping.source);
    return true;
  });
  return mappings.length > 0 ? mappings : DEFAULT_SSE_EVENT_MAPPINGS.map((mapping) => ({ ...mapping }));
}

function normalizeSseDoneEvent(value: unknown): SseDoneEvent {
  if (value === undefined || value === null || value === "") {
    return cloneDefaultSseDoneEvent();
  }
  if (typeof value === "string") {
    try {
      return {
        targetEvent: "done",
        data: JSON.parse(value) as unknown
      };
    } catch {
      throw new Error("sseDoneEvent 文本必须是合法 JSON");
    }
  }
  const record = asRecord(value, "sseDoneEvent");
  return {
    targetEvent: validateSseEventName(asOptionalString(record.targetEvent, "sseDoneEvent.targetEvent") ?? "done", "sseDoneEvent.targetEvent"),
    data: record.data ?? cloneDefaultSseDoneEvent().data
  };
}

function normalizeStreamCodec(value: unknown, provider: AiProvider): StreamCodecId {
  if (value === undefined || value === null || value === "") {
    return getDefaultStreamCodec(provider);
  }
  if (value === "claude-code-v1" || value === "codex-cli-v1" || value === "custom-jsonl-v1") {
    return value;
  }
  throw new Error("streamCodec 必须是 claude-code-v1、codex-cli-v1 或 custom-jsonl-v1");
}

function parseJsonLike(value: unknown, fieldName: string): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${fieldName} 文本必须是合法 JSON`);
  }
}

function normalizeStreamEventKind(value: unknown, fieldName: string): StreamEventKind | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !STREAM_EVENT_KINDS.includes(value as StreamEventKind)) {
    throw new Error(`${fieldName} 不是支持的标准事件类型`);
  }
  return value as StreamEventKind;
}

function normalizeStreamEventChannel(value: unknown, fieldName: string): StreamEventChannel | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !STREAM_EVENT_CHANNELS.includes(value as StreamEventChannel)) {
    throw new Error(`${fieldName} 不是支持的标准事件通道`);
  }
  return value as StreamEventChannel;
}

function normalizeStreamMappingRule(value: unknown, index: number): StreamMappingRule {
  const record = asRecord(value, `streamMappings[${index}]`);
  const match = asRecord(record.match ?? {}, `streamMappings[${index}].match`);
  const emit = asRecord(record.emit, `streamMappings[${index}].emit`);
  const protocol = emit.protocol ?? "sse";
  if (protocol !== "sse") {
    throw new Error(`streamMappings[${index}].emit.protocol 目前只支持 sse`);
  }
  return {
    id: asOptionalString(record.id, `streamMappings[${index}].id`) ?? `mapping-${index + 1}`,
    enabled: normalizeBoolean(record.enabled, `streamMappings[${index}].enabled`, true),
    match: {
      kind: normalizeStreamEventKind(match.kind, `streamMappings[${index}].match.kind`),
      channel: normalizeStreamEventChannel(match.channel, `streamMappings[${index}].match.channel`),
      providerEventType: asOptionalString(match.providerEventType, `streamMappings[${index}].match.providerEventType`),
      toolName: asOptionalString(match.toolName, `streamMappings[${index}].match.toolName`),
      correlationId: asOptionalString(match.correlationId, `streamMappings[${index}].match.correlationId`)
    },
    emit: {
      protocol: "sse",
      event: validateSseEventName(asString(emit.event, `streamMappings[${index}].emit.event`), `streamMappings[${index}].emit.event`),
      data: emit.data
    }
  };
}

function normalizeStreamMappings(value: unknown, legacyMappings: SseEventMapping[]): StreamMappingRule[] {
  const parsed = parseJsonLike(value, "streamMappings");
  if (parsed === undefined || parsed === null || parsed === "") {
    return legacySseMappingsToStreamMappings(legacyMappings);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("streamMappings 必须是数组");
  }
  const mappings = parsed.map(normalizeStreamMappingRule);
  return mappings.length > 0 ? mappings : legacySseMappingsToStreamMappings(legacyMappings);
}

function normalizeStreamDoneEvent(value: unknown, legacyDoneEvent: SseDoneEvent): StreamDoneEvent {
  const parsed = parseJsonLike(value, "streamDoneEvent");
  if (parsed === undefined || parsed === null || parsed === "") {
    return {
      event: legacyDoneEvent.targetEvent,
      data: legacyDoneEvent.data
    };
  }
  const record = asRecord(parsed, "streamDoneEvent");
  return {
    event: validateSseEventName(asOptionalString(record.event, "streamDoneEvent.event") ?? legacyDoneEvent.targetEvent, "streamDoneEvent.event"),
    data: record.data ?? cloneStreamDoneEvent().data
  };
}

function normalizeToolEventPolicy(value: unknown): ToolEventPolicy {
  const parsed = parseJsonLike(value, "toolEventPolicy");
  if (parsed === undefined || parsed === null || parsed === "") {
    return cloneToolEventPolicy();
  }
  const record = asRecord(parsed, "toolEventPolicy");
  return {
    ...cloneToolEventPolicy(),
    enabled: normalizeBoolean(record.enabled, "toolEventPolicy.enabled", DEFAULT_TOOL_EVENT_POLICY.enabled),
    includeInput: normalizeEnum(record.includeInput, ["none", "redacted", "raw"], "toolEventPolicy.includeInput", DEFAULT_TOOL_EVENT_POLICY.includeInput),
    includeOutput: normalizeEnum(record.includeOutput, ["none", "summary", "raw"], "toolEventPolicy.includeOutput", DEFAULT_TOOL_EVENT_POLICY.includeOutput),
    allowToolNames: normalizeStringArray(record.allowToolNames, "toolEventPolicy.allowToolNames"),
    denyToolNames: normalizeStringArray(record.denyToolNames, "toolEventPolicy.denyToolNames"),
    redactPaths: normalizeBoolean(record.redactPaths, "toolEventPolicy.redactPaths", DEFAULT_TOOL_EVENT_POLICY.redactPaths),
    redactSecrets: normalizeBoolean(record.redactSecrets, "toolEventPolicy.redactSecrets", DEFAULT_TOOL_EVENT_POLICY.redactSecrets)
  };
}

function normalizeMappingSecurityPolicy(value: unknown): MappingSecurityPolicy {
  const parsed = parseJsonLike(value, "mappingSecurityPolicy");
  if (parsed === undefined || parsed === null || parsed === "") {
    return cloneMappingSecurityPolicy();
  }
  const record = asRecord(parsed, "mappingSecurityPolicy");
  return {
    ...cloneMappingSecurityPolicy(),
    allowedVariables: normalizeStringArray(record.allowedVariables, "mappingSecurityPolicy.allowedVariables")
      ?? [...DEFAULT_MAPPING_SECURITY_POLICY.allowedVariables],
    allowRaw: normalizeBoolean(record.allowRaw, "mappingSecurityPolicy.allowRaw", DEFAULT_MAPPING_SECURITY_POLICY.allowRaw),
    allowData: normalizeBoolean(record.allowData, "mappingSecurityPolicy.allowData", DEFAULT_MAPPING_SECURITY_POLICY.allowData),
    allowToolInput: normalizeBoolean(record.allowToolInput, "mappingSecurityPolicy.allowToolInput", DEFAULT_MAPPING_SECURITY_POLICY.allowToolInput),
    allowToolOutput: normalizeBoolean(record.allowToolOutput, "mappingSecurityPolicy.allowToolOutput", DEFAULT_MAPPING_SECURITY_POLICY.allowToolOutput),
    redactDiagnostics: normalizeBoolean(record.redactDiagnostics, "mappingSecurityPolicy.redactDiagnostics", DEFAULT_MAPPING_SECURITY_POLICY.redactDiagnostics),
    redactPreview: normalizeBoolean(record.redactPreview, "mappingSecurityPolicy.redactPreview", DEFAULT_MAPPING_SECURITY_POLICY.redactPreview),
    persistRenderedFrames: normalizeBoolean(record.persistRenderedFrames, "mappingSecurityPolicy.persistRenderedFrames", DEFAULT_MAPPING_SECURITY_POLICY.persistRenderedFrames)
  };
}

function normalizeStreamDonePolicy(value: unknown): StreamDonePolicy {
  const parsed = parseJsonLike(value, "streamDonePolicy");
  if (parsed === undefined || parsed === null || parsed === "") {
    return cloneStreamDonePolicy();
  }
  const record = asRecord(parsed, "streamDonePolicy");
  return {
    onProviderDone: normalizeEnum(record.onProviderDone, ["emit_completed", "none"], "streamDonePolicy.onProviderDone", DEFAULT_STREAM_DONE_POLICY.onProviderDone),
    onProviderError: normalizeEnum(record.onProviderError, ["emit_failed", "none"], "streamDonePolicy.onProviderError", DEFAULT_STREAM_DONE_POLICY.onProviderError),
    onRendererError: normalizeEnum(record.onRendererError, ["skip_frame", "emit_error", "fail_stream"], "streamDonePolicy.onRendererError", DEFAULT_STREAM_DONE_POLICY.onRendererError),
    onClientAbort: "none"
  };
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fieldName: string, fallback: T): T {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${fieldName} 不是支持的取值`);
  }
  return value as T;
}

function defaultTemplateForResponseMode(mode: ResponseMode): string {
  switch (mode) {
    case "stream": return "openai_sse";
    case "custom_json": return "business_code_data_message";
    case "mapped_sse": return "generic_sse";
    default: return "openai_chat_json";
  }
}

export function normalizeProfile(value: unknown): ProxyProfile {
  const input = asRecord(value, "profile");
  const id = asString(input.id, "id");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error("id 只能包含字母、数字、下划线和短横线，且最长 64 位");
  }
  const contextRegexFlags = normalizeRegexFlags(input.contextRegexFlags);
  const responseMode = normalizeResponseMode(input.responseMode);
  const provider = normalizeProvider(input.provider);
  const sseEventMappings = normalizeSseEventMappings(input.sseEventMappings);
  const sseDoneEvent = normalizeSseDoneEvent(input.sseDoneEvent);

  return {
    id,
    name: asString(input.name, "name"),
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    targetOrigin: normalizeOrigin(input.targetOrigin),
    targetPath: normalizePath(input.targetPath),
    methods: normalizeMethods(input.methods),
    projectDir: asString(input.projectDir, "projectDir"),
    provider,
    responseMode,
    messageReturnStructure: normalizeMessageReturnStructure(input.messageReturnStructure),
    allowDangerousCli: normalizeBoolean(input.allowDangerousCli, "allowDangerousCli", false),
    enableConversationMemory: normalizeBoolean(input.enableConversationMemory, "enableConversationMemory", false),
    prompt: asOptionalString(input.prompt, "prompt"),
    timeoutMs: normalizeNonNegativeInteger(input.timeoutMs, "timeoutMs", DEFAULT_TIMEOUT_MS),
    maxBodyBytes: normalizeNonNegativeInteger(input.maxBodyBytes, "maxBodyBytes", DEFAULT_MAX_BODY_BYTES),
    contextRegex: normalizeContextRegex(input.contextRegex, contextRegexFlags),
    contextRegexFlags,
    providerArgs: normalizeStringArray(input.providerArgs, "providerArgs"),
    customCommand: asOptionalString(input.customCommand, "customCommand"),
    customArgs: normalizeStringArray(input.customArgs, "customArgs"),
    customJsonTemplate: asOptionalString(input.customJsonTemplate, "customJsonTemplate"),
    sseDataEvents: normalizeEventNames(input.sseDataEvents),
    sseEventMappings,
    sseDoneEvent,
    streamCodec: normalizeStreamCodec(input.streamCodec, provider),
    streamMappings: normalizeStreamMappings(input.streamMappings, sseEventMappings),
    streamDoneEvent: normalizeStreamDoneEvent(input.streamDoneEvent, sseDoneEvent),
    toolEventPolicy: normalizeToolEventPolicy(input.toolEventPolicy),
    mappingSecurityPolicy: normalizeMappingSecurityPolicy(input.mappingSecurityPolicy),
    streamDonePolicy: normalizeStreamDonePolicy(input.streamDonePolicy),
    setupMode: (input.setupMode === "wizard" ? "wizard" : "advanced") as SetupMode,
    responseTemplateId: typeof input.responseTemplateId === "string" && input.responseTemplateId.trim()
      ? input.responseTemplateId.trim()
      : defaultTemplateForResponseMode(responseMode),
    sensitiveHeaderPolicy: input.sensitiveHeaderPolicy === "allow_all" || input.sensitiveHeaderPolicy === "custom"
      ? input.sensitiveHeaderPolicy
      : "default",
    debugEnabled: input.debugEnabled === undefined ? true : Boolean(input.debugEnabled),
    lastTestResult: input.lastTestResult && typeof input.lastTestResult === "object" ? input.lastTestResult as LastTestResult : undefined,
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
