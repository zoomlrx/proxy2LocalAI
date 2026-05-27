import http, { IncomingMessage, ServerResponse } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  composePrompt,
  createMessageProtocolJsonResponse,
  createMessageProtocolPromptPayload,
  createMessageProtocolStreamChunk,
  createMessageProtocolStreamDone,
  createMessageProtocolStreamStart,
  createChatCompletion,
  createErrorResponse,
  createStreamChunk,
  createStreamDone,
  DEFAULT_SSE_DONE_EVENT,
  DEFAULT_SSE_EVENT_MAPPINGS,
  DEFAULT_LOCAL_TOKEN,
  DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
  DEFAULT_STREAM_DONE_POLICY,
  DEFAULT_TOOL_EVENT_POLICY,
  extractAiData,
  extractPromptContext,
  legacySseMappingsToStreamMappings,
  normalizeProfiles,
  redactDiagnosticText,
  renderStreamMappingFramesForEvent,
  renderCustomJsonTemplate,
  sanitizeStreamEventForMapping,
  serializeSseFrame,
  validateCustomJsonTemplate,
  type ConversationTurn,
  type RenderStreamMappingOptions,
  type NormalizedStreamEvent,
  type ProxyProfile
} from "@proxy2localai/shared";
import {
  createDefaultProviders,
  createProviderLogger,
  setProviderLogger,
  type AiProviderAdapter,
  type LegacyProviderStreamEvent,
  type ProviderRunContext,
  type ProviderRegistry,
  type ProviderStreamEvent
} from "./providers";
import { createDoctorReport } from "./doctor";
import { getDefaultBridgeDataDir } from "./paths";
import { createDiagnosticsStore, type DiagnosticsStore } from "./diagnostics";

export interface BridgeServerOptions {
  port?: number;
  token?: string;
  tokenSource?: string;
  providers?: ProviderRegistry;
  profilesPath?: string;
  requestsLogPath?: string;
}

interface RequestParameters {
  page: {
    url: string | null;
    origin: string | null;
    source: "x-proxy2localai-page-url" | "x-web2LocalAgent-page-url" | "referer" | "origin" | "unknown";
  };
  target: {
    origin: string;
    path: string;
  };
  request: {
    method: string;
    query: Record<string, string>;
    headers: Record<string, string | string[]>;
    body: unknown;
  };
}

const BRIDGE_VERSION = "0.1.0";
const PROTOCOL_VERSION = 1;

const MAX_CONVERSATION_MESSAGES = 20;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export function createBridgeServer(options: BridgeServerOptions = {}): http.Server {
  const token = options.token ?? process.env.PROXY2LOCALAI_TOKEN ?? process.env.web2LocalAgent_TOKEN ?? DEFAULT_LOCAL_TOKEN;
  const defaultDataDir = process.env.PROXY2LOCALAI_DATA_DIR ?? process.env.web2LocalAgent_DATA_DIR ?? getDefaultBridgeDataDir();
  const profilesPath = options.profilesPath
    ?? process.env.PROXY2LOCALAI_PROFILES_PATH
    ?? process.env.web2LocalAgent_PROFILES_PATH
    ?? join(defaultDataDir, "profiles.json");
  const requestsLogPath = options.requestsLogPath
    ?? process.env.PROXY2LOCALAI_REQUESTS_LOG_PATH
    ?? process.env.web2LocalAgent_REQUESTS_LOG_PATH
    ?? join(defaultDataDir, "requests.log");
  const port = options.port ?? Number(process.env.PROXY2LOCALAI_PORT ?? process.env.web2LocalAgent_PORT ?? new URL("http://127.0.0.1:39399").port);
  const tokenSource = options.tokenSource
    ?? (process.env.PROXY2LOCALAI_TOKEN ? "PROXY2LOCALAI_TOKEN" : process.env.web2LocalAgent_TOKEN ? "web2LocalAgent_TOKEN" : "default local token");
  setProviderLogger(createProviderLogger(requestsLogPath));
  const profiles = loadProfiles(profilesPath);
  const conversationHistories = new Map<string, ConversationTurn[]>();
  const diagnostics = createDiagnosticsStore({ limit: 20 });
  const providers = {
    ...createDefaultProviders(),
    ...options.providers
  };

  return http.createServer((req, res) => {
    handleRequest(req, res, { port, token, tokenSource, profiles, profilesPath, requestsLogPath, providers, conversationHistories, diagnostics }).catch((error: unknown) => {
      const httpError = error instanceof HttpError
        ? error
        : new HttpError(500, "provider_error", error instanceof Error ? error.message : "未知错误");
      sendJson(res, httpError.status, createErrorResponse(httpError.type, httpError.message, httpError.details));
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: {
    token: string;
    tokenSource: string;
    port: number;
    profiles: Map<string, ProxyProfile>;
    profilesPath: string;
    requestsLogPath: string;
    providers: Required<ProviderRegistry>;
    conversationHistories: Map<string, ConversationTurn[]>;
    diagnostics: DiagnosticsStore;
  }
): Promise<void> {
  setCorsHeaders(req, res);
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "proxy2localai-bridge",
      version: BRIDGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      profileCount: context.profiles.size
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/doctor") {
    assertAuthorized(req, url, context.token);
    sendJson(res, 200, createDoctorReport({
      port: context.port,
      tokenSource: context.tokenSource,
      profilesPath: context.profilesPath,
      requestsLogPath: context.requestsLogPath,
      profiles: Array.from(context.profiles.values())
    }));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/admin/profiles") {
    assertAuthorized(req, url, context.token);
    const body = await readJsonBody(req, 1024 * 1024);
    const input = asRecord(body, "body");
    const normalizedProfiles = normalizeProfiles(input.profiles ?? []);
    context.profiles.clear();
    for (const profile of normalizedProfiles) {
      context.profiles.set(profile.id, profile);
    }
    saveProfiles(context.profilesPath, normalizedProfiles);
    sendJson(res, 200, {
      ok: true,
      profileCount: normalizedProfiles.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/profiles") {
    assertAuthorized(req, url, context.token);
    sendJson(res, 200, {
      profiles: Array.from(context.profiles.values()).map((profile) => ({
        id: profile.id,
        name: profile.name,
        enabled: profile.enabled,
        targetOrigin: profile.targetOrigin,
        targetPath: profile.targetPath,
        methods: profile.methods,
        provider: profile.provider,
        responseMode: profile.responseMode,
        allowDangerousCli: profile.allowDangerousCli,
        enableConversationMemory: profile.enableConversationMemory,
        hasContextRegex: Boolean(profile.contextRegex)
      }))
    });
    return;
  }

  // GET /diagnostics/recent - 最近请求列表
  if (req.method === "GET" && url.pathname === "/diagnostics/recent") {
    assertAuthorized(req, url, context.token);
    sendJson(res, 200, {
      items: context.diagnostics.listRecent()
    });
    return;
  }

  // GET /diagnostics/recent/:requestId - 请求详情
  const diagDetailMatch = /^\/diagnostics\/recent\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && diagDetailMatch) {
    assertAuthorized(req, url, context.token);
    const requestId = decodeURIComponent(diagDetailMatch[1]!);
    const detail = context.diagnostics.getDetail(requestId);
    if (!detail) {
      throw new HttpError(404, "not_found", "诊断记录不存在");
    }
    sendJson(res, 200, detail);
    return;
  }

  // GET /diagnostics/recent/:requestId/export - 脱敏导出
  const diagExportMatch = /^\/diagnostics\/recent\/([^/]+)\/export$/.exec(url.pathname);
  if (req.method === "GET" && diagExportMatch) {
    assertAuthorized(req, url, context.token);
    const requestId = decodeURIComponent(diagExportMatch[1]!);
    const detail = context.diagnostics.getDetail(requestId);
    if (!detail) {
      throw new HttpError(404, "not_found", "诊断记录不存在");
    }
    const exportText = redactDiagnosticText(JSON.stringify({
      summary: detail.summary,
      stages: detail.stages
    }, null, 2));
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8"
    });
    res.end(exportText);
    return;
  }

  const testProfileMatch = /^\/admin\/test-profile\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && testProfileMatch) {
    assertAuthorized(req, url, context.token);
    const profileId = decodeURIComponent(testProfileMatch[1]!);
    const profile = context.profiles.get(profileId);
    if (!profile) {
      throw new HttpError(404, "not_found", "代理配置不存在", { profileId });
    }

    const body = await readJsonBody(req, 1024 * 1024);
    const sample = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    sendJson(res, 200, await runProfileTest(profile, sample, context.providers, `匹配到配置: ${profile.name}`));
    return;
  }

  if (req.method === "POST" && url.pathname === "/admin/test-profile-draft") {
    assertAuthorized(req, url, context.token);
    const body = await readJsonBody(req, 1024 * 1024);
    const input = asRecord(body, "body");
    const [profile] = normalizeProfiles([input.profile]);
    if (!profile) {
      throw new HttpError(400, "bad_request", "profile 必须是合法代理配置");
    }
    sendJson(res, 200, await runProfileTest(profile, input, context.providers, `使用草稿配置: ${profile.name}`));
    return;
  }

  // POST /admin/test-provider/:profileId - Provider 实际检测（最小 prompt）
  const testProviderMatch = /^\/admin\/test-provider\/([^/]+)$/.exec(url.pathname);
  if (req.method === "POST" && testProviderMatch) {
    assertAuthorized(req, url, context.token);
    const providerProfileId = decodeURIComponent(testProviderMatch[1]!);
    const profile = context.profiles.get(providerProfileId);
    if (!profile) {
      throw new HttpError(404, "not_found", "代理配置不存在", { profileId: providerProfileId });
    }

    const provider = context.providers[profile.provider] as AiProviderAdapter | undefined;
    if (!provider) {
      sendJson(res, 200, {
        ok: false,
        provider: profile.provider,
        output: null,
        error: `未找到 provider: ${profile.provider}`
      });
      return;
    }

    try {
      const startMs = Date.now();
      const content = await provider.generateText(profile, "ping");
      sendJson(res, 200, {
        ok: true,
        provider: profile.provider,
        output: content.slice(0, 500),
        outputChars: content.length,
        duration: Date.now() - startMs
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        provider: profile.provider,
        output: null,
        error: error instanceof Error ? error.message : "未知错误"
      });
    }
    return;
  }

  const profileId = matchProxyProfileId(url.pathname);
  if (profileId) {
    assertAuthorized(req, url, context.token);
    const diagRequestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logRequestEvent(context.requestsLogPath, {
      stage: "request_received",
      profileId,
      method: req.method ?? "GET",
      pathname: url.pathname,
      queryKeys: Array.from(url.searchParams.keys()).filter((key) => key !== "token")
    });
    const profile = context.profiles.get(profileId);
    if (!profile || !profile.enabled) {
      throw new HttpError(404, "not_found", "代理配置不存在或未启用", {
        profileId,
        knownProfileIds: Array.from(context.profiles.keys())
      });
    }
    const method = (req.method ?? "GET").toUpperCase();
    if (!profile.methods.includes(method as ProxyProfile["methods"][number])) {
      throw new HttpError(405, "method_not_allowed", `代理配置不允许 ${method} 请求`);
    }

    logRequestEvent(context.requestsLogPath, {
      stage: "profile_matched",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      enabled: profile.enabled
    });

    const pageUrl = req.headers["x-proxy2localai-page-url"] as string | undefined
      ?? (req.headers["x-web2localagent-page-url"] as string | undefined)
      ?? req.headers.referer as string | undefined;
    context.diagnostics.startRequest({
      id: diagRequestId,
      method,
      targetUrl: `${profile.targetOrigin}${profile.targetPath}`,
      profileId: profile.id,
      pageUrl
    });
    context.diagnostics.addStage(diagRequestId, { id: "request_received", status: "ok" });
    context.diagnostics.addStage(diagRequestId, { id: "profile_matched", status: "ok", message: profile.name });

    trackClientAbort(req, context.requestsLogPath, profile);

    const parameters = await buildRequestParameters(req, url, profile);
    const routedParameters = routeRequestParametersForProfile(parameters, profile);
    const conversationKey = createConversationKey(profile, routedParameters);
    const conversationHistory = profile.enableConversationMemory
      ? context.conversationHistories.get(conversationKey) ?? []
      : [];
    const promptOptions = {
      contextRegex: profile.contextRegex,
      contextRegexFlags: profile.contextRegexFlags,
      conversationHistory
    };
    const userContext = extractPromptContext(routedParameters, promptOptions);
    const prompt = composePrompt(routedParameters, profile.prompt, promptOptions);
    const provider = context.providers[profile.provider] as AiProviderAdapter | undefined;
    if (!provider) {
      context.diagnostics.addStage(diagRequestId, { id: "provider_error", status: "error", message: `未找到 provider: ${profile.provider}` });
      context.diagnostics.finishRequest(diagRequestId, { status: "error", errorStage: "provider_error" });
      throw new HttpError(500, "provider_error", `未找到 provider: ${profile.provider}`);
    }

    context.diagnostics.addStage(diagRequestId, { id: "provider_spawn", status: "ok" });

    try {
      if (profile.responseMode === "custom_json") {
        await customJsonResponse(res, profile, provider, prompt, context.requestsLogPath, context.conversationHistories, conversationKey, userContext);
        context.diagnostics.addStage(diagRequestId, { id: "response_done", status: "ok" });
        context.diagnostics.finishRequest(diagRequestId, { status: "ok" });
        return;
      }

      if (profile.responseMode === "mapped_sse") {
        await mappedSseResponse(res, profile, provider, prompt, context.requestsLogPath, context.conversationHistories, conversationKey, userContext);
        context.diagnostics.addStage(diagRequestId, { id: "response_done", status: "ok" });
        context.diagnostics.finishRequest(diagRequestId, { status: "ok" });
        return;
      }

      if (profile.responseMode === "stream") {
        await streamResponse(res, profile, provider, prompt, context.requestsLogPath, context.conversationHistories, conversationKey, userContext);
        context.diagnostics.addStage(diagRequestId, { id: "response_done", status: "ok" });
        context.diagnostics.finishRequest(diagRequestId, { status: "ok" });
        return;
      }

      // block 模式
      logRequestEvent(context.requestsLogPath, {
        stage: "provider_start",
        profileId: profile.id,
        provider: profile.provider,
        responseMode: profile.responseMode
      });
      const providerStartTime = Date.now();
      const content = await provider.generateText(profile, prompt);
      context.diagnostics.addStage(diagRequestId, { id: "provider_done", status: "ok", duration: Date.now() - providerStartTime });
      rememberConversation(context.conversationHistories, profile, conversationKey, userContext, content);
      logRequestEvent(context.requestsLogPath, {
        stage: "provider_done",
        profileId: profile.id,
        provider: profile.provider,
        responseMode: profile.responseMode,
        outputChars: content.length
      });
      sendJson(res, 200, createBlockResponseBody(profile, content));
      context.diagnostics.addStage(diagRequestId, { id: "response_done", status: "ok" });
      context.diagnostics.finishRequest(diagRequestId, { status: "ok" });
      return;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      context.diagnostics.addStage(diagRequestId, { id: "provider_error", status: "error", message: errorMsg });
      context.diagnostics.finishRequest(diagRequestId, { status: "error", errorStage: "provider_error" });
      throw error;
    }
  }

  throw new HttpError(404, "not_found", "路由不存在");
}

async function runProfileTest(
  profile: ProxyProfile,
  sample: Record<string, unknown>,
  providers: ProviderRegistry,
  profileMessage: string
): Promise<{ ok: boolean; stages: Array<{ id: string; status: string; message?: string; duration?: number }>; preview?: string }> {
  const stages: Array<{ id: string; status: string; message?: string; duration?: number }> = [];
  stages.push({ id: "profile_matched", status: "ok", message: profileMessage });

  const sampleData = typeof sample.sample === "object" && sample.sample !== null
    ? sample.sample as Record<string, unknown>
    : {};
  const sampleHeaders = typeof sampleData.headers === "object" && sampleData.headers !== null
    ? sampleData.headers as Record<string, string>
    : { "content-type": "application/json" };
  const sampleBody = sampleData.body ?? { messages: [{ role: "user", content: "ping" }] };

  const parameters: RequestParameters = {
    page: { url: null, origin: null, source: "unknown" },
    target: { origin: profile.targetOrigin, path: profile.targetPath },
    request: {
      method: "POST",
      query: {},
      headers: sampleHeaders,
      body: sampleBody
    }
  };

  stages.push({ id: "request_parsed", status: "ok" });

  const promptOptions = {
    contextRegex: profile.contextRegex,
    contextRegexFlags: profile.contextRegexFlags,
    conversationHistory: [] as ConversationTurn[]
  };
  const prompt = composePrompt(parameters, profile.prompt, promptOptions);

  stages.push({ id: "prompt_composed", status: "ok", message: `提示词长度: ${prompt.length} 字符` });

  const provider = providers[profile.provider] as AiProviderAdapter | undefined;
  if (!provider) {
    stages.push({ id: "provider_done", status: "error", message: `未找到 provider: ${profile.provider}` });
    return { ok: false, stages };
  }

  try {
    stages.push({ id: "provider_start", status: "ok", message: `调用 ${profile.provider}` });
    const startTime = Date.now();
    const content = await provider.generateText(profile, prompt);
    const duration = Date.now() - startTime;
    stages.push({
      id: "provider_done",
      status: "ok",
      message: `输出 ${content.length} 字符`,
      duration
    });
    return { ok: true, stages, preview: content.slice(0, 500) };
  } catch (error) {
    stages.push({
      id: "provider_done",
      status: "error",
      message: error instanceof Error ? error.message : "未知错误"
    });
    return { ok: false, stages };
  }
}

function loadProfiles(profilesPath: string): Map<string, ProxyProfile> {
  if (!existsSync(profilesPath)) {
    return new Map();
  }
  const raw = readFileSync(profilesPath, "utf8");
  const input = raw.trim() ? JSON.parse(raw) as unknown : [];
  const profiles = normalizeProfiles(Array.isArray(input) ? input : (input as { profiles?: unknown }).profiles ?? []);
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function saveProfiles(profilesPath: string, profiles: ProxyProfile[]): void {
  mkdirSync(dirname(profilesPath), { recursive: true });
  writeFileSync(profilesPath, JSON.stringify({ profiles }, null, 2), "utf8");
}

function logRequestEvent(logPath: string, event: Record<string, unknown>): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  })}\n`, "utf8");
}

function createStatusEvent(event: Record<string, unknown>): string {
  return `event: proxy_status\ndata: ${JSON.stringify(event)}\n\n`;
}

function createLocalResponseId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createProviderStatusEvent(profile: ProxyProfile, event: Record<string, unknown>): Record<string, unknown> {
  const status: Record<string, unknown> = {
    stage: typeof event.stage === "string" ? event.stage : "provider_event",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode
  };
  for (const key of [
    "command",
    "args",
    "streaming",
    "promptChars",
    "bytes",
    "lineChars",
    "code",
    "signal",
    "timedOut",
    "stdoutChars",
    "stderrChars",
    "timeoutMs"
  ]) {
    if (event[key] !== undefined) {
      status[key] = event[key];
    }
  }

  if (event.stage === "provider_stdout_line") {
    const lineInfo = extractProviderLineInfo(event.text);
    if (lineInfo.type) {
      status.lineType = lineInfo.type;
    }
    if (lineInfo.subtype) {
      status.lineSubtype = lineInfo.subtype;
    }
  }
  return status;
}

function createConversationKey(profile: ProxyProfile, parameters: RequestParameters): string {
  const pageKey = parameters.page.url ?? parameters.page.origin ?? "unknown";
  return `${profile.id}:${pageKey}`;
}

function rememberConversation(
  histories: Map<string, ConversationTurn[]>,
  profile: ProxyProfile,
  key: string,
  userContent: string,
  assistantContent: string
): void {
  if (!profile.enableConversationMemory) {
    return;
  }
  const next = [
    ...(histories.get(key) ?? []),
    { role: "user" as const, content: userContent },
    { role: "assistant" as const, content: assistantContent }
  ].slice(-MAX_CONVERSATION_MESSAGES);
  histories.set(key, next);
}

function extractProviderLineInfo(value: unknown): { type?: string; subtype?: string } {
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    return {
      type: typeof record.type === "string" ? record.type : undefined,
      subtype: typeof record.subtype === "string" ? record.subtype : undefined
    };
  } catch {
    return {};
  }
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = firstHeaderValue(req.headers.origin);
  const requestedHeaders = firstHeaderValue(req.headers["access-control-request-headers"]);
  res.setHeader("access-control-allow-origin", origin || "*");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    requestedHeaders || "content-type,authorization,x-proxy2localai-token,x-web2LocalAgent-token,x-proxy2localai-page-url,x-web2LocalAgent-page-url"
  );
  res.setHeader("access-control-allow-private-network", "true");
  res.setHeader("access-control-max-age", "600");
  res.setHeader("vary", "Origin, Access-Control-Request-Headers, Access-Control-Request-Private-Network");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

function assertAuthorized(req: IncomingMessage, url: URL, expectedToken: string): void {
  const headerToken = req.headers["x-proxy2localai-token"] ?? req.headers["x-web2localagent-token"];
  const actualToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  const queryToken = url.searchParams.get("token");
  if ((actualToken ?? queryToken) !== expectedToken) {
    throw new HttpError(401, "unauthorized", "本地桥接服务 token 不正确");
  }
}

function matchProxyProfileId(pathname: string): string | null {
  const match = /^\/proxy\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "bad_request", `${fieldName} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function readBody(req: IncomingMessage, maxBodyBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (maxBodyBytes > 0 && size > maxBodyBytes) {
        reject(new HttpError(413, "payload_too_large", "请求体超过配置上限"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function readJsonBody(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const raw = await readBody(req, maxBodyBytes);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "bad_request", "请求体必须是合法 JSON");
  }
}

function parseBody(raw: string, contentType: string | undefined): unknown {
  if (!raw) {
    return null;
  }
  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function buildRequestParameters(req: IncomingMessage, url: URL, profile: ProxyProfile): Promise<RequestParameters> {
  const rawBody = await readBody(req, profile.maxBodyBytes);
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== "token") {
      query[key] = value;
    }
  }

  return {
    page: extractPageContext(req.headers),
    target: {
      origin: profile.targetOrigin,
      path: profile.targetPath
    },
    request: {
      method: req.method ?? "GET",
      query,
      headers: sanitizeHeaders(req.headers),
      body: parseBody(rawBody, req.headers["content-type"])
    }
  };
}

function routeRequestParametersForProfile(parameters: RequestParameters, profile: ProxyProfile): RequestParameters {
  const routed = createMessageProtocolPromptPayload({
    structure: profile.messageReturnStructure,
    targetPath: parameters.target.path,
    body: parameters.request.body
  });
  if (routed.messages.length === 0) {
    return parameters;
  }
  return {
    ...parameters,
    request: {
      ...parameters.request,
      body: {
        ...routed,
        originalBody: parameters.request.body
      }
    }
  };
}

function shouldUseProtocolResponse(profile: ProxyProfile): boolean {
  return Boolean(profile.messageReturnStructure);
}

function createBlockResponseBody(profile: ProxyProfile, content: string): unknown {
  const model = `local-${profile.provider}`;
  if (!shouldUseProtocolResponse(profile)) {
    return createChatCompletion({
      content,
      model
    });
  }
  return createMessageProtocolJsonResponse({
    structure: profile.messageReturnStructure,
    content,
    model
  });
}

function extractPageContext(headers: IncomingMessage["headers"]): RequestParameters["page"] {
  const candidates: Array<{ source: RequestParameters["page"]["source"]; value: string | undefined }> = [
    { source: "x-proxy2localai-page-url", value: firstHeaderValue(headers["x-proxy2localai-page-url"]) },
    { source: "x-web2LocalAgent-page-url", value: firstHeaderValue(headers["x-web2localagent-page-url"]) },
    { source: "referer", value: firstHeaderValue(headers.referer) },
    { source: "origin", value: firstHeaderValue(headers.origin) }
  ];

  for (const candidate of candidates) {
    const value = candidate.value?.trim();
    if (!value) {
      continue;
    }
    const parsed = safeParseUrl(value);
    return {
      url: parsed?.href ?? value,
      origin: parsed?.origin ?? null,
      source: candidate.source
    };
  }

  return {
    url: null,
    origin: null,
    source: "unknown"
  };
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function sanitizeHeaders(headers: IncomingMessage["headers"]): Record<string, string | string[]> {
  const sanitized: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (key.toLowerCase() === "x-proxy2localai-token" || key.toLowerCase() === "x-web2localagent-token" || key.toLowerCase() === "authorization") {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

async function streamResponse(
  res: ServerResponse,
  profile: ProxyProfile,
  provider: AiProviderAdapter,
  prompt: string,
  requestsLogPath: string,
  conversationHistories: Map<string, ConversationTurn[]>,
  conversationKey: string,
  userContext: string
): Promise<void> {
  if (shouldUseProtocolResponse(profile)) {
    await protocolStreamResponse(res, profile, provider, prompt, requestsLogPath, conversationHistories, conversationKey, userContext);
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  logRequestEvent(requestsLogPath, {
    stage: "response_headers_sent",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode,
    contentType: "text/event-stream; charset=utf-8"
  });

  try {
    const startEvent = {
      stage: "provider_start",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode
    };
    logRequestEvent(requestsLogPath, startEvent);
    res.write(createStatusEvent(startEvent));
    let chunkCount = 0;
    let assistantContent = "";
    const providerContext: ProviderRunContext = {
      onEvent(event) {
        res.write(createStatusEvent(createProviderStatusEvent(profile, event)));
      }
    };
    for await (const content of provider.streamText(profile, prompt, providerContext)) {
      if (chunkCount === 0) {
        logRequestEvent(requestsLogPath, {
          stage: "provider_first_chunk",
          profileId: profile.id,
          provider: profile.provider,
          responseMode: profile.responseMode,
          chunkChars: content.length
        });
      }
      chunkCount += 1;
      assistantContent += content;
      res.write(createStreamChunk({
        content,
        model: `local-${profile.provider}`
      }));
      logRequestEvent(requestsLogPath, {
        stage: "response_chunk_written",
        profileId: profile.id,
        provider: profile.provider,
        responseMode: profile.responseMode,
        chunkIndex: chunkCount,
        chunkChars: content.length
      });
    }
    logRequestEvent(requestsLogPath, {
      stage: "provider_done",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      chunkCount
    });
    rememberConversation(conversationHistories, profile, conversationKey, userContext, assistantContent);
    res.write(createStreamDone());
    logRequestEvent(requestsLogPath, {
      stage: "response_done_written",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      chunkCount
    });
    res.end();
  } catch (error) {
    logRequestEvent(requestsLogPath, {
      stage: "provider_error",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      message: error instanceof Error ? error.message : "未知错误"
    });
    res.write(createStreamChunk({
      content: error instanceof Error ? `错误: ${error.message}` : "未知错误",
      model: `local-${profile.provider}`
    }));
    res.write(createStreamDone());
    res.end();
  }
}

async function protocolStreamResponse(
  res: ServerResponse,
  profile: ProxyProfile,
  provider: AiProviderAdapter,
  prompt: string,
  requestsLogPath: string,
  conversationHistories: Map<string, ConversationTurn[]>,
  conversationKey: string,
  userContext: string
): Promise<void> {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  logRequestEvent(requestsLogPath, {
    stage: "response_headers_sent",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode,
    messageReturnStructure: profile.messageReturnStructure,
    contentType: "text/event-stream; charset=utf-8"
  });

  const model = `local-${profile.provider}`;
  const responseId = createLocalResponseId(profile.messageReturnStructure === "openai_responses"
    ? "resp"
    : profile.messageReturnStructure === "anthropic_messages"
      ? "msg"
      : "chatcmpl");
  const itemId = createLocalResponseId("msg");
  let assistantContent = "";
  let chunkCount = 0;

  try {
    logRequestEvent(requestsLogPath, {
      stage: "provider_start",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      messageReturnStructure: profile.messageReturnStructure
    });
    res.write(createMessageProtocolStreamStart({
      structure: profile.messageReturnStructure,
      model,
      id: responseId,
      itemId
    }));

    const providerContext: ProviderRunContext = {
      onEvent(event) {
        const providerStatus = createProviderStatusEvent(profile, event);
        logRequestEvent(requestsLogPath, {
          ...providerStatus,
          stage: "provider_status",
          messageReturnStructure: profile.messageReturnStructure,
          providerStage: providerStatus.stage
        });
      }
    };

    for await (const content of provider.streamText(profile, prompt, providerContext)) {
      chunkCount += 1;
      assistantContent += content;
      res.write(createMessageProtocolStreamChunk({
        structure: profile.messageReturnStructure,
        content,
        model,
        id: responseId,
        itemId
      }));
      logRequestEvent(requestsLogPath, {
        stage: "response_chunk_written",
        profileId: profile.id,
        provider: profile.provider,
        responseMode: profile.responseMode,
        messageReturnStructure: profile.messageReturnStructure,
        chunkIndex: chunkCount,
        chunkChars: content.length
      });
    }

    rememberConversation(conversationHistories, profile, conversationKey, userContext, assistantContent);
    res.write(createMessageProtocolStreamDone({
      structure: profile.messageReturnStructure,
      content: assistantContent,
      model,
      id: responseId,
      itemId
    }));
    logRequestEvent(requestsLogPath, {
      stage: "response_done_written",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      messageReturnStructure: profile.messageReturnStructure,
      chunkCount
    });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    logRequestEvent(requestsLogPath, {
      stage: "provider_error",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      message
    });
    res.write(createMessageProtocolStreamChunk({
      structure: profile.messageReturnStructure,
      content: `错误: ${message}`,
      model,
      id: responseId,
      itemId
    }));
    res.write(createMessageProtocolStreamDone({
      structure: profile.messageReturnStructure,
      content: assistantContent,
      model,
      id: responseId,
      itemId
    }));
    res.end();
  }
}

function trackClientAbort(req: IncomingMessage, logPath: string, profile: ProxyProfile): void {
  req.on("aborted", () => {
    logRequestEvent(logPath, {
      stage: "client_aborted",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode
    });
  });
}

async function customJsonResponse(
  res: ServerResponse,
  profile: ProxyProfile,
  provider: AiProviderAdapter,
  prompt: string,
  requestsLogPath: string,
  conversationHistories: Map<string, ConversationTurn[]>,
  conversationKey: string,
  userContext: string
): Promise<void> {
  validateCustomJsonTemplate(profile.customJsonTemplate);
  logRequestEvent(requestsLogPath, {
    stage: "provider_start",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode
  });
  const raw = await provider.generateRawText(profile, prompt);
  const aiData = extractAiData(raw, {
    sseDataEvents: profile.sseDataEvents
  });
  const body = renderCustomJsonTemplate({
    aiData,
    template: profile.customJsonTemplate
  });
  rememberConversation(conversationHistories, profile, conversationKey, userContext, aiData);
  logRequestEvent(requestsLogPath, {
    stage: "provider_done",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode,
    outputChars: aiData.length
  });
  sendRawJson(res, 200, body);
}

function sendRawJson(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  res.end(body);
}

async function mappedSseResponseV2(
  res: ServerResponse,
  profile: ProxyProfile,
  provider: AiProviderAdapter,
  prompt: string,
  requestsLogPath: string,
  conversationHistories: Map<string, ConversationTurn[]>,
  conversationKey: string,
  userContext: string
): Promise<void> {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  logRequestEvent(requestsLogPath, {
    stage: "response_headers_sent",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode,
    contentType: "text/event-stream; charset=utf-8"
  });

  const doneEvent = profile.streamDoneEvent ?? {
    event: (profile.sseDoneEvent ?? DEFAULT_SSE_DONE_EVENT).targetEvent,
    data: (profile.sseDoneEvent ?? DEFAULT_SSE_DONE_EVENT).data
  };
  const rendererErrorPolicy: RenderStreamMappingOptions["rendererErrorPolicy"] = profile.streamDonePolicy?.onRendererError === "emit_error"
    ? "emit_error"
    : profile.streamDonePolicy?.onRendererError === "fail_stream"
      ? "throw"
      : "drop_frame";
  const renderOptions: RenderStreamMappingOptions = {
    ...DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
    rendererErrorPolicy,
    securityPolicy: profile.mappingSecurityPolicy ?? DEFAULT_RENDER_STREAM_MAPPING_OPTIONS.securityPolicy
  };

  try {
    logRequestEvent(requestsLogPath, {
      stage: "provider_start",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode
    });
    let chunkCount = 0;
    let assistantContent = "";
    for await (const event of streamNormalizedProviderEvents(provider, profile, prompt)) {
      const sanitized = sanitizeStreamEventForMapping(event, profile.toolEventPolicy);
      if (!sanitized) {
        continue;
      }
      if (sanitized.kind === "delta" && sanitized.channel === "message" && sanitized.content) {
        assistantContent += sanitized.content;
      }
      const frames = renderStreamMappingFramesForEvent(sanitized, profile.streamMappings ?? [], renderOptions);
      for (const frame of frames) {
        chunkCount += 1;
        res.write(frame.frame);
        logRequestEvent(requestsLogPath, {
          stage: "response_chunk_written",
          profileId: profile.id,
          provider: profile.provider,
          responseMode: profile.responseMode,
          sourceEvent: `${sanitized.kind}/${sanitized.channel}`,
          targetEvent: frame.event,
          chunkIndex: chunkCount,
          chunkChars: frame.frame.length
        });
      }
    }
    rememberConversation(conversationHistories, profile, conversationKey, userContext, assistantContent);
    if (profile.streamDonePolicy?.onProviderDone !== "none") {
      res.write(serializeSseFrame(doneEvent.event, JSON.stringify(doneEvent.data)));
    }
    logRequestEvent(requestsLogPath, {
      stage: "response_done_written",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      chunkCount,
      targetEvent: doneEvent.event
    });
    res.end();
  } catch (error) {
    logRequestEvent(requestsLogPath, {
      stage: "provider_error",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      message: error instanceof Error ? error.message : "unknown error"
    });
    res.write(serializeSseFrame("error", JSON.stringify({
      message: error instanceof Error ? error.message : "unknown error"
    })));
    if (profile.streamDonePolicy?.onProviderError !== "none") {
      res.write(serializeSseFrame(doneEvent.event, JSON.stringify({
        ...(typeof doneEvent.data === "object" && doneEvent.data !== null && !Array.isArray(doneEvent.data)
          ? doneEvent.data as Record<string, unknown>
          : {}),
        status: "failed"
      })));
    }
    res.end();
  }
}

function shouldUseMappedSseV2(profile: ProxyProfile): boolean {
  const streamMappings = profile.streamMappings ?? [];
  if (streamMappings.length === 0) {
    return false;
  }

  const legacyMappings = legacySseMappingsToStreamMappings(profile.sseEventMappings ?? DEFAULT_SSE_EVENT_MAPPINGS);
  const legacyDoneEvent = profile.sseDoneEvent ?? DEFAULT_SSE_DONE_EVENT;
  const legacyStreamDoneEvent = {
    event: legacyDoneEvent.targetEvent,
    data: legacyDoneEvent.data
  };
  const streamDoneEvent = profile.streamDoneEvent ?? legacyStreamDoneEvent;
  const hasCustomV2Policy =
    stableJson(profile.toolEventPolicy ?? DEFAULT_TOOL_EVENT_POLICY) !== stableJson(DEFAULT_TOOL_EVENT_POLICY)
    || stableJson(profile.mappingSecurityPolicy ?? DEFAULT_RENDER_STREAM_MAPPING_OPTIONS.securityPolicy) !== stableJson(DEFAULT_RENDER_STREAM_MAPPING_OPTIONS.securityPolicy)
    || stableJson(profile.streamDonePolicy ?? DEFAULT_STREAM_DONE_POLICY) !== stableJson(DEFAULT_STREAM_DONE_POLICY);

  const isUnmodifiedLegacyMappings = stableJson(streamMappings) === stableJson(legacyMappings);
  const isUnmodifiedLegacyDone = stableJson(streamDoneEvent) === stableJson(legacyStreamDoneEvent);
  return hasCustomV2Policy || !(isUnmodifiedLegacyMappings && isUnmodifiedLegacyDone);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

async function mappedSseResponse(
  res: ServerResponse,
  profile: ProxyProfile,
  provider: AiProviderAdapter,
  prompt: string,
  requestsLogPath: string,
  conversationHistories: Map<string, ConversationTurn[]>,
  conversationKey: string,
  userContext: string
): Promise<void> {
  if (shouldUseMappedSseV2(profile)) {
    await mappedSseResponseV2(res, profile, provider, prompt, requestsLogPath, conversationHistories, conversationKey, userContext);
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  logRequestEvent(requestsLogPath, {
    stage: "response_headers_sent",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode,
    contentType: "text/event-stream; charset=utf-8"
  });

  const mappings = new Map((profile.sseEventMappings ?? DEFAULT_SSE_EVENT_MAPPINGS)
    .map((mapping) => [mapping.source, mapping.targetEvent]));
  const doneEvent = profile.sseDoneEvent ?? DEFAULT_SSE_DONE_EVENT;

  try {
    logRequestEvent(requestsLogPath, {
      stage: "provider_start",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode
    });
    let chunkCount = 0;
    let assistantContent = "";
    for await (const event of streamProviderEvents(provider, profile, prompt)) {
      const targetEvent = mappings.get(event.source);
      if (!targetEvent) {
        continue;
      }
      chunkCount += 1;
      if (event.source === "message" || targetEvent === "message") {
        assistantContent += event.content;
      }
      res.write(createMappedSseTextEvent(targetEvent, event.content));
      logRequestEvent(requestsLogPath, {
        stage: "response_chunk_written",
        profileId: profile.id,
        provider: profile.provider,
        responseMode: profile.responseMode,
        sourceEvent: event.source,
        targetEvent,
        chunkIndex: chunkCount,
        chunkChars: event.content.length
      });
    }
    rememberConversation(conversationHistories, profile, conversationKey, userContext, assistantContent);
    res.write(createMappedSseDataEvent(doneEvent.targetEvent, doneEvent.data));
    logRequestEvent(requestsLogPath, {
      stage: "response_done_written",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      chunkCount,
      targetEvent: doneEvent.targetEvent
    });
    res.end();
  } catch (error) {
    logRequestEvent(requestsLogPath, {
      stage: "provider_error",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      message: error instanceof Error ? error.message : "未知错误"
    });
    res.write(createMappedSseDataEvent("error", {
      message: error instanceof Error ? error.message : "未知错误"
    }));
    res.write(createMappedSseDataEvent(doneEvent.targetEvent, doneEvent.data));
    res.end();
  }
}

async function* streamNormalizedProviderEvents(
  provider: AiProviderAdapter,
  profile: ProxyProfile,
  prompt: string
): AsyncIterable<NormalizedStreamEvent> {
  let legacySequence = 0;
  if (provider.streamEvents) {
    for await (const event of provider.streamEvents(profile, prompt)) {
      if (isLegacyProviderStreamEvent(event)) {
        legacySequence += 1;
        yield legacyProviderEventToNormalized(event, profile, legacySequence);
      } else {
        yield event;
      }
    }
    return;
  }
  for await (const content of provider.streamText(profile, prompt)) {
    legacySequence += 1;
    yield legacyProviderEventToNormalized({ source: "message", content }, profile, legacySequence);
  }
}

async function* streamProviderEvents(
  provider: AiProviderAdapter,
  profile: ProxyProfile,
  prompt: string
): AsyncIterable<LegacyProviderStreamEvent> {
  if (provider.streamEvents) {
    for await (const event of provider.streamEvents(profile, prompt)) {
      if (isLegacyProviderStreamEvent(event)) {
        yield event;
        continue;
      }
      const legacy = normalizedProviderEventToLegacy(event);
      if (legacy) {
        yield legacy;
      }
    }
    return;
  }
  for await (const content of provider.streamText(profile, prompt)) {
    yield {
      source: "message",
      content
    };
  }
}

function createMappedSseTextEvent(event: string, content: string): string {
  return `event:${event}\ndata:${JSON.stringify(JSON.stringify(content))}\n\n`;
}

function createMappedSseDataEvent(event: string, data: unknown): string {
  return `event:${event}\ndata:${JSON.stringify(data)}\n\n`;
}

function isLegacyProviderStreamEvent(event: ProviderStreamEvent): event is LegacyProviderStreamEvent {
  return "source" in event;
}

function legacyProviderEventToNormalized(
  event: LegacyProviderStreamEvent,
  profile: ProxyProfile,
  sequence: number
): NormalizedStreamEvent {
  return {
    provider: profile.provider === "claude" || profile.provider === "codex" ? profile.provider : "custom",
    eventId: `evt_${String(sequence).padStart(6, "0")}`,
    sequence,
    kind: event.source === "error" ? "error" : "delta",
    channel: event.source === "reasoning" ? "reasoning" : event.source === "debug" ? "debug" : event.source === "status" || event.source === "error" ? "status" : "message",
    content: event.content,
    meta: { providerEventType: event.source }
  };
}

function normalizedProviderEventToLegacy(event: NormalizedStreamEvent): LegacyProviderStreamEvent | null {
  if (!event.content) {
    return null;
  }
  if (event.channel === "reasoning") {
    return { source: "reasoning", content: event.content };
  }
  if (event.channel === "debug") {
    return { source: "debug", content: event.content };
  }
  if (event.kind === "error") {
    return { source: "error", content: event.content };
  }
  if (event.channel === "status") {
    return { source: "status", content: event.content };
  }
  return { source: "message", content: event.content };
}
