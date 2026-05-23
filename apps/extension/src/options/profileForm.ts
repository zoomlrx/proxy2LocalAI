import {
  DEFAULT_CONTEXT_REGEX_FLAGS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_SSE_DONE_EVENT,
  DEFAULT_SSE_EVENT_MAPPINGS,
  DEFAULT_TIMEOUT_MS,
  getBuiltinResponseTemplate,
  normalizeProfile,
  parseCurlCommand,
  type AppConfig,
  type AiProvider,
  type HttpMethod,
  type ProxyProfile,
  type ResponseMode,
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
  return setupMode === "wizard" ? ["basic"] : ["basic", "advanced"];
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
