import http, { IncomingMessage, ServerResponse } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  composePrompt,
  createChatCompletion,
  createErrorResponse,
  createStreamChunk,
  createStreamDone,
  DEFAULT_SSE_DONE_EVENT,
  DEFAULT_SSE_EVENT_MAPPINGS,
  DEFAULT_LOCAL_TOKEN,
  extractAiData,
  extractPromptContext,
  normalizeProfiles,
  renderCustomJsonTemplate,
  validateCustomJsonTemplate,
  type ConversationTurn,
  type ProxyProfile
} from "@proxy2localai/shared";
import {
  createDefaultProviders,
  createProviderLogger,
  setProviderLogger,
  type AiProviderAdapter,
  type ProviderRunContext,
  type ProviderRegistry,
  type ProviderStreamEvent
} from "./providers";
import { createDoctorReport } from "./doctor";
import { getDefaultBridgeDataDir } from "./paths";

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
  const providers = {
    ...createDefaultProviders(),
    ...options.providers
  };

  return http.createServer((req, res) => {
    handleRequest(req, res, { port, token, tokenSource, profiles, profilesPath, requestsLogPath, providers, conversationHistories }).catch((error: unknown) => {
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

  const profileId = matchProxyProfileId(url.pathname);
  if (profileId) {
    assertAuthorized(req, url, context.token);
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
    trackClientAbort(req, context.requestsLogPath, profile);

    const parameters = await buildRequestParameters(req, url, profile);
    const conversationKey = createConversationKey(profile, parameters);
    const conversationHistory = profile.enableConversationMemory
      ? context.conversationHistories.get(conversationKey) ?? []
      : [];
    const promptOptions = {
      contextRegex: profile.contextRegex,
      contextRegexFlags: profile.contextRegexFlags,
      conversationHistory
    };
    const userContext = extractPromptContext(parameters, promptOptions);
    const prompt = composePrompt(parameters, profile.prompt, promptOptions);
    const provider = context.providers[profile.provider] as AiProviderAdapter | undefined;
    if (!provider) {
      throw new HttpError(500, "provider_error", `未找到 provider: ${profile.provider}`);
    }

    if (profile.responseMode === "custom_json") {
      await customJsonResponse(res, profile, provider, prompt, context.requestsLogPath, context.conversationHistories, conversationKey, userContext);
      return;
    }

    if (profile.responseMode === "mapped_sse") {
      await mappedSseResponse(res, profile, provider, prompt, context.requestsLogPath, context.conversationHistories, conversationKey, userContext);
      return;
    }

    if (profile.responseMode === "stream") {
      await streamResponse(res, profile, provider, prompt, context.requestsLogPath, context.conversationHistories, conversationKey, userContext);
      return;
    }

    logRequestEvent(context.requestsLogPath, {
      stage: "provider_start",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode
    });
    const content = await provider.generateText(profile, prompt);
    rememberConversation(context.conversationHistories, profile, conversationKey, userContext, content);
    logRequestEvent(context.requestsLogPath, {
      stage: "provider_done",
      profileId: profile.id,
      provider: profile.provider,
      responseMode: profile.responseMode,
      outputChars: content.length
    });
    sendJson(res, 200, createChatCompletion({
      content,
      model: `local-${profile.provider}`
    }));
    return;
  }

  throw new HttpError(404, "not_found", "路由不存在");
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

async function* streamProviderEvents(
  provider: AiProviderAdapter,
  profile: ProxyProfile,
  prompt: string
): AsyncIterable<ProviderStreamEvent> {
  if (provider.streamEvents) {
    yield* provider.streamEvents(profile, prompt);
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
