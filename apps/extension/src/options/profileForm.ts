import {
  DEFAULT_CONTEXT_REGEX_FLAGS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MESSAGE_RETURN_STRUCTURE,
  DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
  DEFAULT_SSE_DONE_EVENT,
  DEFAULT_SSE_EVENT_MAPPINGS,
  DEFAULT_STREAM_DONE_POLICY,
  DEFAULT_STREAM_DONE_EVENT,
  DEFAULT_TOOL_EVENT_POLICY,
  DEFAULT_TIMEOUT_MS,
  BUILTIN_RESPONSE_TEMPLATES,
  getDefaultStreamCodec,
  getBuiltinResponseTemplate,
  normalizeProfile,
  parseCurlCommand,
  renderStreamMappingFramesForEvent,
  sanitizeStreamEventForMapping,
  serializeSseFrame,
  streamMappingsToLegacySseEventMappings,
  type AppConfig,
  type AiProvider,
  type HttpMethod,
  type MessageReturnStructure,
  type MappingSecurityPolicy,
  type NormalizedStreamEvent,
  type ProxyProfile,
  type RenderStreamMappingOptions,
  type ResponseMode,
  type ResponseTemplate,
  type SetupMode,
  type SensitiveHeaderPolicy,
  type StreamCodecId,
  type StreamDoneEvent,
  type StreamDonePolicy,
  type StreamMappingRule,
  type ToolEventPolicy,
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
  messageReturnStructure: MessageReturnStructure;
  allowDangerousCli: boolean;
  enableConversationMemory: boolean;
  prompt: string;
  timeoutMs: number;
  maxBodyBytes: number;
  contextRegex: string;
  contextRegexFlags: string;
  providerArgs: string;
  customCommand: string;
  customArgs: string;
  customJsonTemplate: string;
  sseDataEvents: string;
  sseEventMappings: string;
  sseDoneEvent: string;
  streamCodec: StreamCodecId;
  streamMappings: string;
  streamDoneEvent: string;
  toolEventPolicy: string;
  mappingSecurityPolicy: string;
  streamDonePolicy: string;
  setupMode: SetupMode;
  responseTemplateId: string;
  sensitiveHeaderPolicy: SensitiveHeaderPolicy;
  debugEnabled: boolean;
  lastTestResult: string;
}

const DEFAULT_DRAFT_STREAM_MAPPINGS: StreamMappingRule[] = [
  {
    id: "legacy-reasoning",
    enabled: true,
    match: { kind: "delta", channel: "reasoning" },
    emit: { protocol: "sse", event: "reasoning", data: "{{content}}" }
  },
  {
    id: "legacy-message",
    enabled: true,
    match: { kind: "delta", channel: "message" },
    emit: { protocol: "sse", event: "message", data: "{{content}}" }
  }
];

export const MESSAGE_RETURN_STRUCTURE_OPTIONS: Array<{
  value: MessageReturnStructure;
  label: string;
  description: string;
  recommended: boolean;
  routeRequired: boolean;
}> = [
  {
    value: "anthropic_messages",
    label: "Anthropic Messages（原生，推荐）",
    description: "保持本地 Claude Code / Anthropic Messages 原生消息结构，不需要额外路由转换。",
    recommended: true,
    routeRequired: false
  },
  {
    value: "openai_chat_completions",
    label: "OpenAI Chat Completions（需开启路由转换）",
    description: "Bridge 会把目标请求/响应转换为 OpenAI Chat Completions 结构。",
    recommended: false,
    routeRequired: true
  },
  {
    value: "openai_responses",
    label: "OpenAI Responses API（需开启路由转换）",
    description: "Bridge 会把目标请求/响应转换为 OpenAI Responses API 结构。",
    recommended: false,
    routeRequired: true
  },
  {
    value: "gemini_generate_content",
    label: "Gemini Native generateContent（需开启路由转换）",
    description: "Bridge 会把目标请求/响应转换为 Gemini generateContent 原生结构。",
    recommended: false,
    routeRequired: true
  }
];

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
    messageReturnStructure: DEFAULT_MESSAGE_RETURN_STRUCTURE,
    allowDangerousCli: false,
    enableConversationMemory: false,
    prompt: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    contextRegex: "",
    contextRegexFlags: DEFAULT_CONTEXT_REGEX_FLAGS,
    providerArgs: "",
    customCommand: "",
    customArgs: "",
    customJsonTemplate: "",
    sseDataEvents: "message",
    sseEventMappings: DEFAULT_SSE_EVENT_MAPPINGS.map((mapping) => `${mapping.source}=${mapping.targetEvent}`).join("\n"),
    sseDoneEvent: JSON.stringify(DEFAULT_SSE_DONE_EVENT.data, null, 2),
    streamCodec: "claude-code-v1",
    streamMappings: formatJson(DEFAULT_DRAFT_STREAM_MAPPINGS),
    streamDoneEvent: formatJson(DEFAULT_STREAM_DONE_EVENT),
    toolEventPolicy: "",
    mappingSecurityPolicy: "",
    streamDonePolicy: "",
    setupMode: "advanced",
    responseTemplateId: "openai_chat_json",
    sensitiveHeaderPolicy: "default",
    debugEnabled: true,
    lastTestResult: "",
  };
}

export function profileToDraft(profile: ProxyProfile): ProfileDraft {
  return {
    ...profile,
    allowDangerousCli: profile.allowDangerousCli,
    enableConversationMemory: profile.enableConversationMemory,
    prompt: profile.prompt ?? "",
    contextRegex: profile.contextRegex ?? "",
    contextRegexFlags: profile.contextRegexFlags,
    providerArgs: profile.providerArgs?.join("\n") ?? "",
    messageReturnStructure: profile.messageReturnStructure ?? DEFAULT_MESSAGE_RETURN_STRUCTURE,
    customCommand: profile.customCommand ?? "",
    customArgs: profile.customArgs?.join("\n") ?? "",
    customJsonTemplate: profile.customJsonTemplate ?? "",
    sseDataEvents: profile.sseDataEvents?.join("\n") ?? "message",
    sseEventMappings: (profile.sseEventMappings ?? DEFAULT_SSE_EVENT_MAPPINGS)
      .map((mapping) => `${mapping.source}=${mapping.targetEvent}`)
      .join("\n"),
    sseDoneEvent: JSON.stringify(profile.sseDoneEvent?.data ?? DEFAULT_SSE_DONE_EVENT.data, null, 2),
    streamCodec: profile.streamCodec ?? getDefaultStreamCodec(profile.provider),
    streamMappings: formatJson(profile.streamMappings ?? DEFAULT_DRAFT_STREAM_MAPPINGS),
    streamDoneEvent: formatJson(profile.streamDoneEvent ?? {
      event: profile.sseDoneEvent?.targetEvent ?? DEFAULT_STREAM_DONE_EVENT.event,
      data: profile.sseDoneEvent?.data ?? DEFAULT_STREAM_DONE_EVENT.data
    }),
    toolEventPolicy: profile.toolEventPolicy ? formatJson(profile.toolEventPolicy) : "",
    mappingSecurityPolicy: profile.mappingSecurityPolicy ? formatJson(profile.mappingSecurityPolicy) : "",
    streamDonePolicy: profile.streamDonePolicy ? formatJson(profile.streamDonePolicy) : "",
    setupMode: profile.setupMode,
    responseTemplateId: profile.responseTemplateId,
    sensitiveHeaderPolicy: profile.sensitiveHeaderPolicy,
    debugEnabled: profile.debugEnabled,
    lastTestResult: profile.lastTestResult ? JSON.stringify(profile.lastTestResult) : "",
  };
}

export function draftToProfile(draft: ProfileDraft): ProxyProfile {
  const streamMappings = parseStreamMappingsDraft(draft.streamMappings);
  const streamDoneEvent = parseStreamDoneEventDraft(draft.streamDoneEvent);
  const legacyMappings = streamMappingsToLegacySseEventMappings(streamMappings);
  return normalizeProfile({
    ...draft,
    prompt: draft.prompt || undefined,
    allowDangerousCli: draft.allowDangerousCli,
    enableConversationMemory: draft.enableConversationMemory,
    customCommand: draft.customCommand || undefined,
    contextRegex: draft.contextRegex || undefined,
    contextRegexFlags: draft.contextRegexFlags || DEFAULT_CONTEXT_REGEX_FLAGS,
    providerArgs: draft.providerArgs
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    customArgs: draft.customArgs
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    customJsonTemplate: draft.customJsonTemplate || undefined,
    sseDataEvents: draft.sseDataEvents
      .split(/[\r\n,]+/)
      .map((line) => line.trim())
      .filter(Boolean),
    sseEventMappings: legacyMappings.length > 0 ? legacyMappings : draft.sseEventMappings,
    sseDoneEvent: draft.sseDoneEvent,
    streamCodec: draft.streamCodec,
    streamMappings,
    streamDoneEvent,
    toolEventPolicy: draft.toolEventPolicy || undefined,
    mappingSecurityPolicy: draft.mappingSecurityPolicy || undefined,
    streamDonePolicy: draft.streamDonePolicy || undefined,
    lastTestResult: draft.lastTestResult ? JSON.parse(draft.lastTestResult) : undefined,
  });
}

export function parseStreamMappingsDraft(value: string): StreamMappingRule[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("streamMappings 必须是数组");
  }
  return parsed as StreamMappingRule[];
}

export function parseStreamDoneEventDraft(value: string): StreamDoneEvent {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_STREAM_DONE_EVENT;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("streamDoneEvent 必须是对象");
  }
  return parsed as StreamDoneEvent;
}

function parseOptionalObjectDraft<T extends object>(value: string, fieldName: string): Partial<T> | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是对象`);
  }
  return parsed as Partial<T>;
}

function createPreviewRenderOptions(securityPolicy: MappingSecurityPolicy, donePolicy: StreamDonePolicy): RenderStreamMappingOptions {
  return {
    ...DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
    rendererErrorPolicy: donePolicy.onRendererError === "emit_error"
      ? "emit_error"
      : donePolicy.onRendererError === "fail_stream"
        ? "throw"
        : "drop_frame",
    securityPolicy
  };
}

export interface StreamMappingPreviewResult {
  ok: boolean;
  output: string;
  error?: string;
}

export function createStreamMappingPreview(draft: ProfileDraft, event: NormalizedStreamEvent): StreamMappingPreviewResult {
  try {
    const mappings = parseStreamMappingsDraft(draft.streamMappings);
    const doneEvent = parseStreamDoneEventDraft(draft.streamDoneEvent);
    const toolEventPolicy: ToolEventPolicy = {
      ...DEFAULT_TOOL_EVENT_POLICY,
      ...parseOptionalObjectDraft<ToolEventPolicy>(draft.toolEventPolicy, "toolEventPolicy")
    };
    const parsedSecurityPolicy = parseOptionalObjectDraft<MappingSecurityPolicy>(draft.mappingSecurityPolicy, "mappingSecurityPolicy");
    const mappingSecurityPolicy: MappingSecurityPolicy = {
      ...DEFAULT_RENDER_STREAM_MAPPING_OPTIONS.securityPolicy,
      ...parsedSecurityPolicy,
      allowedVariables: parsedSecurityPolicy?.allowedVariables ?? DEFAULT_RENDER_STREAM_MAPPING_OPTIONS.securityPolicy.allowedVariables
    };
    const streamDonePolicy: StreamDonePolicy = {
      ...DEFAULT_STREAM_DONE_POLICY,
      ...parseOptionalObjectDraft<StreamDonePolicy>(draft.streamDonePolicy, "streamDonePolicy")
    };
    const sanitizedEvent = sanitizeStreamEventForMapping(event, toolEventPolicy);
    const frames = sanitizedEvent
      ? renderStreamMappingFramesForEvent(sanitizedEvent, mappings, createPreviewRenderOptions(mappingSecurityPolicy, streamDonePolicy))
      : [];
    const output = [
      ...frames.map((frame) => frame.frame),
      ...(streamDonePolicy.onProviderDone === "none"
        ? []
        : [serializeSseFrame(doneEvent.event, JSON.stringify(doneEvent.data))])
    ].join("");
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export interface InferredStreamMapping {
  streamMappings: StreamMappingRule[];
  streamDoneEvent: StreamDoneEvent;
}

export function inferStreamMappingFromSample(sample: string): InferredStreamMapping {
  const frames = parseSseSampleFrames(sample);
  const messageFrame = frames.find((frame) => !/^(done|finish|complete)$/i.test(frame.event)) ?? frames[0];
  const doneFrame = frames.find((frame) => /^(done|finish|complete)$/i.test(frame.event));
  const messageEvent = messageFrame?.event || "message";
  const messageData = replaceFirstTextField(messageFrame?.data ?? { content: "hello" });
  return {
    streamMappings: [
      {
        id: "message",
        enabled: true,
        match: { kind: "delta", channel: "message" },
        emit: {
          protocol: "sse",
          event: messageEvent,
          data: messageData
        }
      }
    ],
    streamDoneEvent: {
      event: doneFrame?.event || "done",
      data: doneFrame?.data ?? DEFAULT_STREAM_DONE_EVENT.data
    }
  };
}

function parseSseSampleFrames(sample: string): Array<{ event: string; data: unknown }> {
  const frames: Array<{ event: string; data: unknown }> = [];
  for (const rawFrame of sample.split(/\r?\n\r?\n/)) {
    const lines = rawFrame.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim() || "message";
    const dataText = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (!event && !dataText) {
      continue;
    }
    frames.push({
      event,
      data: parseMaybeJson(dataText)
    });
  }
  return frames;
}

function parseMaybeJson(value: string): unknown {
  if (!value) {
    return "";
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function replaceFirstTextField(value: unknown): unknown {
  const replaced = replaceFirstTextFieldInner(value);
  return replaced.value;
}

function replaceFirstTextFieldInner(value: unknown): { value: unknown; replaced: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value: "{{content}}", replaced: true };
  }
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  let replaced = false;
  for (const [key, child] of Object.entries(record)) {
    if (!replaced && ["content", "text", "delta", "message"].includes(key) && typeof child === "string") {
      next[key] = "{{content}}";
      replaced = true;
      continue;
    }
    if (!replaced && child && typeof child === "object" && !Array.isArray(child)) {
      const nested = replaceFirstTextFieldInner(child);
      next[key] = nested.value;
      replaced = nested.replaced;
      continue;
    }
    next[key] = child;
  }
  return replaced ? { value: next, replaced } : { value: { ...record, content: "{{content}}" }, replaced: true };
}

export function upsertProfile(config: AppConfig, profile: ProxyProfile): AppConfig {
  const exists = config.profiles.some((item) => item.id === profile.id);
  return {
    ...config,
    profiles: exists
      ? config.profiles.map((item) => (item.id === profile.id ? profile : item))
      : [...config.profiles, profile]
  };
}

export type ProfileSection = "basic" | "advanced" | "expert";

export function getDefaultExpandedSections(setupMode: SetupMode): ProfileSection[] {
  return setupMode === "wizard" ? ["basic"] : ["basic"];
}

export interface CurlSummary {
  origin: string;
  path: string;
  method: HttpMethod;
  bodySummary: string;
  stream: boolean;
}

function summarizeBody(body: string | undefined): { bodySummary: string; stream: boolean } {
  if (!body) {
    return { bodySummary: "无请求体", stream: false };
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return {
        bodySummary: Object.keys(record).slice(0, 8).join(", ") || "空 JSON 对象",
        stream: record.stream === true
      };
    }
  } catch {
    // 非 JSON 请求体只做安全摘要。
  }
  const compact = body.replace(/\s+/g, " ").trim();
  return {
    bodySummary: compact.length > 120 ? `${compact.slice(0, 120)}...` : compact,
    stream: /"stream"\s*:\s*true/.test(body)
  };
}

export function summarizeCurlCommand(curlCommand: string): CurlSummary {
  const parsed = parseCurlCommand(curlCommand);
  const url = new URL(parsed.url);
  const body = summarizeBody(parsed.body);
  return {
    origin: url.origin,
    path: url.pathname || "/",
    method: parsed.method,
    bodySummary: body.bodySummary,
    stream: body.stream
  };
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

export function createWizardProfileFromCurl(curlCommand: string, projectDir: string): ProfileDraft {
  const blank = createBlankProfile(projectDir);
  const filled = applyCurlToDraft(blank, curlCommand);
  return {
    ...filled,
    setupMode: "wizard",
    provider: "claude",
    responseMode: "stream",
    responseTemplateId: "openai_sse"
  };
}

export function getRecommendedTemplateId(responseMode: ResponseMode): string {
  switch (responseMode) {
    case "stream":
      return "openai_sse";
    case "mapped_sse":
      return "generic_sse";
    case "custom_json":
      return "business_code_data_message";
    case "block":
    default:
      return "openai_chat_json";
  }
}

export interface RecommendedTemplateCard {
  id: string;
  name: string;
  responseMode: ResponseMode;
  description: string;
  examplePreview: string;
  recommended: boolean;
  recommendReason: string;
}

const TEMPLATE_ORDER = [
  "openai_sse",
  "openai_chat_json",
  "business_code_data_message",
  "generic_sse"
];

function getTemplateRecommendReason(template: ResponseTemplate, responseMode: ResponseMode): string {
  if (template.id === getRecommendedTemplateId(responseMode)) {
    switch (responseMode) {
      case "stream":
        return "当前返回类型为流式 SSE，推荐 OpenAI SSE 兼容模板。";
      case "block":
        return "当前返回类型为普通 JSON，推荐 OpenAI Chat JSON 模板。";
      case "custom_json":
        return "当前返回类型为自定义 JSON，推荐业务 JSON 模板。";
      case "mapped_sse":
        return "当前返回类型为映射 SSE，推荐通用 SSE 映射模板。";
    }
  }
  return "可在目标接口需要该协议时手动选择。";
}

export function getRecommendedTemplateCards(responseMode: ResponseMode): RecommendedTemplateCard[] {
  const recommendedId = getRecommendedTemplateId(responseMode);
  return TEMPLATE_ORDER
    .map((id) => BUILTIN_RESPONSE_TEMPLATES.find((template) => template.id === id))
    .filter((template): template is ResponseTemplate => Boolean(template))
    .map((template) => ({
      id: template.id,
      name: template.name,
      responseMode: template.responseMode,
      description: template.description,
      examplePreview: template.examplePreview,
      recommended: template.id === recommendedId,
      recommendReason: getTemplateRecommendReason(template, responseMode)
    }));
}

export function applyResponseModeToDraft(draft: ProfileDraft, responseMode: ResponseMode): ProfileDraft {
  return applyTemplateToDraft({
    ...draft,
    responseMode
  }, getRecommendedTemplateId(responseMode));
}

export function applyTemplateToDraft(draft: ProfileDraft, templateId: string): ProfileDraft {
  const template = getBuiltinResponseTemplate(templateId);
  if (!template) return draft;

  const updated: ProfileDraft = {
    ...draft,
    responseTemplateId: template.id,
    responseMode: template.responseMode
  };

  if (template.customJsonTemplate !== undefined) {
    updated.customJsonTemplate = template.customJsonTemplate;
  }

  if (template.sseEventMappings !== undefined) {
    updated.sseEventMappings = template.sseEventMappings
      .map((m) => `${m.source}=${m.targetEvent}`)
      .join("\n");
  }

  if (template.streamMappings !== undefined) {
    updated.streamMappings = formatJson(template.streamMappings);
    const legacyMappings = streamMappingsToLegacySseEventMappings(template.streamMappings);
    if (legacyMappings.length > 0) {
      updated.sseEventMappings = legacyMappings
        .map((m) => `${m.source}=${m.targetEvent}`)
        .join("\n");
    }
  }

  if (template.streamDoneEvent !== undefined) {
    updated.streamDoneEvent = formatJson(template.streamDoneEvent);
    updated.sseDoneEvent = formatJson(template.streamDoneEvent.data);
  }

  if (template.streamCodec !== undefined) {
    updated.streamCodec = template.streamCodec;
  }

  if (template.toolEventPolicy !== undefined) {
    updated.toolEventPolicy = formatJson(template.toolEventPolicy);
  }

  if (template.mappingSecurityPolicy !== undefined) {
    updated.mappingSecurityPolicy = formatJson(template.mappingSecurityPolicy);
  }

  if (template.streamDonePolicy !== undefined) {
    updated.streamDonePolicy = formatJson(template.streamDonePolicy);
  }

  if (template.sseDataEvents !== undefined) {
    updated.sseDataEvents = template.sseDataEvents.join("\n");
  }

  return updated;
}
