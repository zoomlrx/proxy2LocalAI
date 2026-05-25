import {
  DEFAULT_CONTEXT_REGEX_FLAGS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_SSE_DONE_EVENT,
  DEFAULT_SSE_EVENT_MAPPINGS,
  DEFAULT_TIMEOUT_MS,
  BUILTIN_RESPONSE_TEMPLATES,
  getBuiltinResponseTemplate,
  normalizeProfile,
  parseCurlCommand,
  type AppConfig,
  type AiProvider,
  type HttpMethod,
  type ProxyProfile,
  type ResponseMode,
  type ResponseTemplate,
  type SetupMode,
  type SensitiveHeaderPolicy
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
  setupMode: SetupMode;
  responseTemplateId: string;
  sensitiveHeaderPolicy: SensitiveHeaderPolicy;
  debugEnabled: boolean;
  lastTestResult: string;
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
    customCommand: profile.customCommand ?? "",
    customArgs: profile.customArgs?.join("\n") ?? "",
    customJsonTemplate: profile.customJsonTemplate ?? "",
    sseDataEvents: profile.sseDataEvents?.join("\n") ?? "message",
    sseEventMappings: (profile.sseEventMappings ?? DEFAULT_SSE_EVENT_MAPPINGS)
      .map((mapping) => `${mapping.source}=${mapping.targetEvent}`)
      .join("\n"),
    sseDoneEvent: JSON.stringify(profile.sseDoneEvent?.data ?? DEFAULT_SSE_DONE_EVENT.data, null, 2),
    setupMode: profile.setupMode,
    responseTemplateId: profile.responseTemplateId,
    sensitiveHeaderPolicy: profile.sensitiveHeaderPolicy,
    debugEnabled: profile.debugEnabled,
    lastTestResult: profile.lastTestResult ? JSON.stringify(profile.lastTestResult) : "",
  };
}

export function draftToProfile(draft: ProfileDraft): ProxyProfile {
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
    sseEventMappings: draft.sseEventMappings,
    sseDoneEvent: draft.sseDoneEvent,
    lastTestResult: draft.lastTestResult ? JSON.parse(draft.lastTestResult) : undefined,
  });
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

  if (template.sseDataEvents !== undefined) {
    updated.sseDataEvents = template.sseDataEvents.join("\n");
  }

  return updated;
}
