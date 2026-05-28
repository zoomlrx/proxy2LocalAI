# Proxy Diagnostics And Custom JSON Response Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增加配置级启动/关闭、自定义 JSON 返回模板、原始 SSE 聚合能力，并把“代理后的请求没有返回”的根因定位纳入第一阶段交付。

**Architecture:** 先在 bridge 请求链路加入可测试的诊断阶段，确认请求从 DNR 到 provider 再到响应写回的断点。随后在 shared 配置模型中扩展返回模式和模板能力，bridge 根据 profile 选择现有 OpenAI 兼容返回或新的 `custom_json` 聚合返回，extension 负责配置录入、启停同步和 DNR 刷新。

**Tech Stack:** TypeScript, Node.js `http`, Chrome MV3 declarativeNetRequest, React, Vitest, tsup, Vite.

---

## Implementation Notes

- 所有实现都遵循 TDD：先写失败测试，再改最小代码。
- 不改变现有 `block` 和 `stream` 默认行为；新增 `custom_json` 作为第三种 `responseMode`。
- `<aiData/>` 采用 JSON 自动编码：模板 `{ "code": 0, "data": <aiData/> }` 中的 AI 文本会被替换为合法 JSON 字符串。
- 原始 SSE 默认提取 `message` 事件；每个配置可用 `sseDataEvents` 覆盖，例如 `["message"]` 或 `["reasoning", "message"]`。
- “启动/关闭”使用已有 `enabled` 字段，关闭后 extension 不生成 DNR 规则，bridge 也拒绝直接访问该 profile。
- 当前已有只读证据显示部分请求曾到达 bridge，并且 provider 曾 `provider_done`；因此诊断要覆盖“bridge 已写回但客户端不识别”和“真实浏览器请求未命中同一个 profile”两条路径。

### Task 1: Add Bridge No-Response Diagnostics Tests

**Files:**
- Modify: `apps/bridge/src/server.test.ts`

**Step 1: Write failing tests for request lifecycle diagnostics**

Add tests that assert the request log contains explicit lifecycle stages for a successful stream response:

```ts
it("logs proxy request lifecycle stages for stream responses", async () => {
  const dataDir = tempDirs[0]!;
  const requestsLogPath = join(dataDir, "requests.log");
  const server = createTestBridgeServer({
    token,
    requestsLogPath,
    providers: {
      claude: {
        async generateText() {
          return "ok";
        },
        async *streamText() {
          yield "hello";
        }
      }
    }
  });
  const baseUrl = await listen(server);

  await httpJson(baseUrl, "PUT", "/admin/profiles", {
    profiles: [{
      id: "diagnostic-stream",
      name: "Diagnostic Stream",
      targetOrigin: "https://api.example.com",
      targetPath: "/chat",
      projectDir: "C:/work",
      responseMode: "stream"
    }]
  }, { "x-proxy2localai-token": token });

  const response = await httpJson(baseUrl, "POST", `/proxy/diagnostic-stream?token=${token}`, { q: "hello" });
  const log = await readFile(requestsLogPath, "utf8");

  expect(response.status).toBe(200);
  expect(log).toContain("\"stage\":\"request_received\"");
  expect(log).toContain("\"stage\":\"profile_matched\"");
  expect(log).toContain("\"stage\":\"response_headers_sent\"");
  expect(log).toContain("\"stage\":\"response_chunk_written\"");
  expect(log).toContain("\"stage\":\"response_done_written\"");
});
```

Add a second test for client abort diagnostics:

```ts
it("logs client aborts while a provider is still running", async () => {
  const dataDir = tempDirs[0]!;
  const requestsLogPath = join(dataDir, "requests.log");
  const server = createTestBridgeServer({
    token,
    requestsLogPath,
    providers: {
      claude: {
        async generateText() {
          return "ok";
        },
        async *streamText() {
          await new Promise((resolve) => setTimeout(resolve, 50));
          yield "late";
        }
      }
    }
  });
  const baseUrl = await listen(server);

  await httpJson(baseUrl, "PUT", "/admin/profiles", {
    profiles: [{
      id: "abort-stream",
      name: "Abort Stream",
      targetOrigin: "https://api.example.com",
      targetPath: "/chat",
      projectDir: "C:/work",
      responseMode: "stream"
    }]
  }, { "x-proxy2localai-token": token });

  await new Promise<void>((resolve, reject) => {
    const req = request(new URL(`/proxy/abort-stream?token=${token}`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" }
    });
    req.on("error", () => resolve());
    req.write(JSON.stringify({ q: "hello" }));
    req.destroy();
    setTimeout(resolve, 80);
  });

  const log = await readFile(requestsLogPath, "utf8");
  expect(log).toContain("\"stage\":\"client_aborted\"");
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- apps/bridge/src/server.test.ts
```

Expected: FAIL because the new lifecycle stages are not logged yet.

**Step 3: Commit only after implementation in Task 2**

Do not commit this task alone unless the project convention allows committing failing tests.

### Task 2: Implement Bridge Diagnostics

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Test: `apps/bridge/src/server.test.ts`

**Step 1: Add request lifecycle logging helpers**

In `handleRequest`, log `request_received` after authorization and before profile lookup for `/proxy/:id`:

```ts
logRequestEvent(context.requestsLogPath, {
  stage: "request_received",
  profileId,
  method: req.method ?? "GET",
  pathname: url.pathname,
  queryKeys: Array.from(url.searchParams.keys()).filter((key) => key !== "token")
});
```

After profile and method validation, log `profile_matched`:

```ts
logRequestEvent(context.requestsLogPath, {
  stage: "profile_matched",
  profileId: profile.id,
  provider: profile.provider,
  responseMode: profile.responseMode,
  enabled: profile.enabled
});
```

**Step 2: Track client aborts**

Add a small helper in `server.ts`:

```ts
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
```

Call it once after `profile_matched`.

**Step 3: Log response write milestones**

In `streamResponse`, log immediately after `writeHead`:

```ts
logRequestEvent(requestsLogPath, {
  stage: "response_headers_sent",
  profileId: profile.id,
  provider: profile.provider,
  responseMode: profile.responseMode,
  contentType: "text/event-stream; charset=utf-8"
});
```

After writing each AI chunk, log a compact stage:

```ts
res.write(createStreamChunk({ content, model: `local-${profile.provider}` }));
logRequestEvent(requestsLogPath, {
  stage: "response_chunk_written",
  profileId: profile.id,
  provider: profile.provider,
  responseMode: profile.responseMode,
  chunkIndex: chunkCount,
  chunkChars: content.length
});
```

After writing done:

```ts
res.write(createStreamDone());
logRequestEvent(requestsLogPath, {
  stage: "response_done_written",
  profileId: profile.id,
  provider: profile.provider,
  responseMode: profile.responseMode,
  chunkCount
});
```

**Step 4: Run focused tests**

Run:

```powershell
npm test -- apps/bridge/src/server.test.ts
```

Expected: PASS for the new diagnostics tests and existing bridge tests.

**Step 5: Commit**

```powershell
git add apps/bridge/src/server.ts apps/bridge/src/server.test.ts
git commit -m "test: add bridge proxy diagnostics"
```

### Task 3: Extend Shared Profile Schema For Custom JSON

**Files:**
- Modify: `packages/shared/src/profile.ts`
- Modify: `packages/shared/src/profile.test.ts`
- Modify: `apps/extension/src/options/profileForm.ts`
- Modify: `apps/extension/src/options/profileForm.test.ts`

**Step 1: Write failing shared schema tests**

Add tests in `packages/shared/src/profile.test.ts`:

```ts
it("normalizes custom json response settings", () => {
  const profile = normalizeProfile({
    id: "custom-json",
    name: "Custom JSON",
    targetOrigin: "https://api.example.com",
    targetPath: "/chat",
    projectDir: "C:/work",
    responseMode: "custom_json",
    customJsonTemplate: "{ \"code\": 0, \"data\": <aiData/> }",
    sseDataEvents: ["message", "reasoning", "message"]
  });

  expect(profile.responseMode).toBe("custom_json");
  expect(profile.customJsonTemplate).toBe("{ \"code\": 0, \"data\": <aiData/> }");
  expect(profile.sseDataEvents).toEqual(["message", "reasoning"]);
});

it("defaults custom json event extraction to message", () => {
  const profile = normalizeProfile({
    id: "custom-json-defaults",
    name: "Custom JSON Defaults",
    targetOrigin: "https://api.example.com",
    targetPath: "/chat",
    projectDir: "C:/work",
    responseMode: "custom_json"
  });

  expect(profile.sseDataEvents).toEqual(["message"]);
});
```

**Step 2: Write failing form tests**

Add in `apps/extension/src/options/profileForm.test.ts`:

```ts
it("round-trips custom json draft fields", () => {
  const profile = draftToProfile({
    ...createBlankProfile("C:/work"),
    id: "custom-json",
    name: "Custom JSON",
    targetOrigin: "https://api.example.com",
    targetPath: "/chat",
    responseMode: "custom_json",
    customJsonTemplate: "{ \"code\": 0, \"data\": <aiData/> }",
    sseDataEvents: "message\nreasoning"
  });

  expect(profile.responseMode).toBe("custom_json");
  expect(profile.customJsonTemplate).toBe("{ \"code\": 0, \"data\": <aiData/> }");
  expect(profile.sseDataEvents).toEqual(["message", "reasoning"]);
});
```

**Step 3: Run tests to verify they fail**

Run:

```powershell
npm test -- packages/shared/src/profile.test.ts apps/extension/src/options/profileForm.test.ts
```

Expected: FAIL because `custom_json`, `customJsonTemplate`, and `sseDataEvents` do not exist yet.

**Step 4: Implement schema changes**

In `packages/shared/src/profile.ts`:

```ts
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
```

Add normalization:

```ts
function normalizeEventNames(value: unknown): string[] {
  const raw = value === undefined || value === null || value === ""
    ? ["message"]
    : Array.isArray(value)
      ? value
      : String(value).split(/[\r\n,]+/);

  const events = Array.from(new Set(raw
    .map((item) => asString(item, "sseDataEvents").trim())
    .filter(Boolean)));

  if (events.length === 0) {
    return ["message"];
  }
  return events;
}
```

Set fields in `normalizeProfile`:

```ts
customJsonTemplate: asOptionalString(input.customJsonTemplate, "customJsonTemplate"),
sseDataEvents: normalizeEventNames(input.sseDataEvents)
```

**Step 5: Implement form draft changes**

In `ProfileDraft`, add:

```ts
customJsonTemplate: string;
sseDataEvents: string;
```

In `createBlankProfile`, default:

```ts
customJsonTemplate: "",
sseDataEvents: "message"
```

In `profileToDraft`:

```ts
customJsonTemplate: profile.customJsonTemplate ?? "",
sseDataEvents: profile.sseDataEvents?.join("\n") ?? "message"
```

In `draftToProfile`:

```ts
customJsonTemplate: draft.customJsonTemplate || undefined,
sseDataEvents: draft.sseDataEvents
  .split(/[\r\n,]+/)
  .map((line) => line.trim())
  .filter(Boolean)
```

**Step 6: Run focused tests**

Run:

```powershell
npm test -- packages/shared/src/profile.test.ts apps/extension/src/options/profileForm.test.ts
```

Expected: PASS.

**Step 7: Commit**

```powershell
git add packages/shared/src/profile.ts packages/shared/src/profile.test.ts apps/extension/src/options/profileForm.ts apps/extension/src/options/profileForm.test.ts
git commit -m "feat: add custom json profile settings"
```

### Task 4: Add AI Output Aggregation And JSON Template Helpers

**Files:**
- Create: `packages/shared/src/responseTemplate.ts`
- Create: `packages/shared/src/responseTemplate.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write failing helper tests**

Create `packages/shared/src/responseTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  extractAiData,
  parseSseFrames,
  renderCustomJsonTemplate,
  validateCustomJsonTemplate
} from "./responseTemplate";

describe("custom response template helpers", () => {
  it("parses raw SSE frames", () => {
    const frames = parseSseFrames([
      "event:reasoning",
      "data:\"ignore\"",
      "",
      "event:message",
      "data:\"hello\"",
      "",
      "event:done",
      "data:{\"status\":\"completed\"}",
      ""
    ].join("\n"));

    expect(frames).toEqual([
      { event: "reasoning", data: "\"ignore\"" },
      { event: "message", data: "\"hello\"" },
      { event: "done", data: "{\"status\":\"completed\"}" }
    ]);
  });

  it("extracts configured event data from raw SSE", () => {
    const raw = [
      "event:reasoning",
      "data:\"ignore\"",
      "",
      "event:message",
      "data:\"你\"",
      "",
      "event:message",
      "data:\"好\"",
      ""
    ].join("\n");

    expect(extractAiData(raw, { sseDataEvents: ["message"] })).toBe("你好");
  });

  it("renders ai data as a JSON encoded value", () => {
    expect(renderCustomJsonTemplate({
      aiData: "hello \"world\"",
      template: "{ \"code\": 0, \"data\": <aiData/> }"
    })).toBe("{ \"code\": 0, \"data\": \"hello \\\"world\\\"\" }");
  });

  it("uses ai data alone when template is empty", () => {
    expect(renderCustomJsonTemplate({
      aiData: "hello",
      template: undefined
    })).toBe("\"hello\"");
  });

  it("rejects invalid JSON templates", () => {
    expect(() => validateCustomJsonTemplate("{ data: <aiData/> }")).toThrow(/JSON/);
    expect(() => validateCustomJsonTemplate("{ \"data\": \"missing\" }")).toThrow(/<aiData\/>/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```powershell
npm test -- packages/shared/src/responseTemplate.test.ts
```

Expected: FAIL because the helper module does not exist yet.

**Step 3: Implement helpers**

Create `packages/shared/src/responseTemplate.ts`:

```ts
export interface SseFrame {
  event: string;
  data: string;
}

export interface ExtractAiDataOptions {
  sseDataEvents?: string[];
}

export interface RenderCustomJsonTemplateInput {
  aiData: string;
  template?: string;
}

const AI_DATA_TAG = "<aiData/>";

export function parseSseFrames(raw: string): SseFrame[] {
  const frames: SseFrame[] = [];
  let event = "message";
  const dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }
    frames.push({
      event,
      data: dataLines.join("\n")
    });
    event = "message";
    dataLines.length = 0;
  };

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  flush();
  return frames;
}

function decodeSseData(data: string): string {
  if (data === "[DONE]") {
    return "";
  }
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed);
    }
    return String(parsed ?? "");
  } catch {
    return data;
  }
}

function looksLikeSse(raw: string): boolean {
  return /^event:/m.test(raw) || /^data:/m.test(raw);
}

export function extractAiData(raw: string, options: ExtractAiDataOptions = {}): string {
  const events = new Set(options.sseDataEvents?.length ? options.sseDataEvents : ["message"]);
  if (!looksLikeSse(raw)) {
    return raw;
  }

  return parseSseFrames(raw)
    .filter((frame) => events.has(frame.event))
    .map((frame) => decodeSseData(frame.data))
    .join("");
}

export function renderCustomJsonTemplate(input: RenderCustomJsonTemplateInput): string {
  const template = input.template?.trim() || AI_DATA_TAG;
  return template.replaceAll(AI_DATA_TAG, JSON.stringify(input.aiData));
}

export function validateCustomJsonTemplate(template: string | undefined): void {
  const normalized = template?.trim();
  if (!normalized) {
    return;
  }
  if (!normalized.includes(AI_DATA_TAG)) {
    throw new Error("自定义 JSON 模板必须包含 <aiData/>");
  }
  const rendered = renderCustomJsonTemplate({
    aiData: "test",
    template: normalized
  });
  try {
    JSON.parse(rendered);
  } catch {
    throw new Error("自定义 JSON 模板替换 <aiData/> 后必须是合法 JSON");
  }
}
```

Export it from `packages/shared/src/index.ts`:

```ts
export * from "./responseTemplate";
```

**Step 4: Run focused tests**

Run:

```powershell
npm test -- packages/shared/src/responseTemplate.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add packages/shared/src/responseTemplate.ts packages/shared/src/responseTemplate.test.ts packages/shared/src/index.ts
git commit -m "feat: add custom response template helpers"
```

### Task 5: Add Raw Provider Output For Custom JSON

**Files:**
- Modify: `apps/bridge/src/providers.ts`
- Modify: `apps/bridge/src/providers.test.ts`

**Step 1: Write failing provider test**

Add in `apps/bridge/src/providers.test.ts`:

```ts
it("can collect raw provider output without parsing", async () => {
  const provider = createCliProvider();
  const script = [
    "process.stdin.resume();",
    "process.stdin.on('end', () => {",
    "  console.log('event:message');",
    "  console.log('data:\"hello\"');",
    "  console.log('');",
    "});"
  ].join(" ");

  await expect(provider.generateRawText({
    ...baseProfile,
    provider: "custom",
    responseMode: "custom_json",
    projectDir: process.cwd(),
    customCommand: process.execPath,
    customArgs: ["-e", script]
  }, "prompt")).resolves.toContain("event:message");
});
```

**Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- apps/bridge/src/providers.test.ts
```

Expected: FAIL because `generateRawText` does not exist.

**Step 3: Extend provider interface and implementation**

In `AiProviderAdapter`:

```ts
generateRawText(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): Promise<string>;
```

In `createCliProvider`:

```ts
async generateRawText(profile, prompt, context) {
  const spec = createProviderCommand(profile, true);
  return runCommandToRawText(spec, profile, prompt, context);
}
```

Add `runCommandToRawText` by copying the lifecycle structure from `runCommandToText`, but do not call `extractTextFromProviderLine`:

```ts
async function runCommandToRawText(
  spec: CommandSpec,
  profile: ProxyProfile,
  prompt: string,
  context?: ProviderRunContext
): Promise<string> {
  logSpawn(profile, spec, prompt, true, context);
  const child = spawn(spec.command, spec.args, {
    cwd: profile.projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  }) as ChildProcessWithoutNullStreams;
  const timeout = killAfterTimeout(child, profile, spec, context);
  writePrompt(child, prompt);

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
    emitProviderEvent(context, {
      stage: "provider_stdout",
      provider: profile.provider,
      bytes: chunk.length
    });
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
    emitProviderEvent(context, {
      stage: "provider_stderr",
      provider: profile.provider,
      bytes: chunk.length,
      text: chunk.toString("utf8").slice(0, 1000)
    });
  });

  const exit = await new Promise<ProcessExit>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    if (timeout.timer) {
      clearTimeout(timeout.timer);
    }
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
  emitProviderEvent(context, {
    stage: "provider_exit",
    provider: profile.provider,
    code: exit.code,
    signal: exit.signal,
    timedOut: timeout.timedOut(),
    stdoutChars: stdout.length,
    stderrChars: stderr.length
  });
  if (timeout.timedOut()) {
    throw new Error(`${spec.command} 超时 ${profile.timeoutMs}ms 后终止`);
  }
  if (exit.code !== 0) {
    throw new Error(stderr || `${spec.command} 退出码 ${exit.code ?? "unknown"}`);
  }
  return stdout;
}
```

**Step 4: Run focused tests**

Run:

```powershell
npm test -- apps/bridge/src/providers.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add apps/bridge/src/providers.ts apps/bridge/src/providers.test.ts
git commit -m "feat: collect raw provider output"
```

### Task 6: Implement Custom JSON Response In Bridge

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/server.test.ts`

**Step 1: Write failing bridge tests**

Add in `apps/bridge/src/server.test.ts`:

```ts
it("returns custom json using aggregated SSE message data", async () => {
  const fakeProvider: AiProviderAdapter = {
    async generateText() {
      return "unused";
    },
    async *streamText() {
      yield "unused";
    },
    async generateRawText() {
      return [
        "event:reasoning",
        "data:\"ignore\"",
        "",
        "event:message",
        "data:\"你\"",
        "",
        "event:message",
        "data:\"好\"",
        ""
      ].join("\n");
    }
  };
  const server = createTestBridgeServer({
    token,
    providers: { claude: fakeProvider }
  });
  const baseUrl = await listen(server);

  await httpJson(baseUrl, "PUT", "/admin/profiles", {
    profiles: [{
      id: "custom-json",
      name: "Custom JSON",
      targetOrigin: "https://api.example.com",
      targetPath: "/chat",
      projectDir: "C:/work",
      responseMode: "custom_json",
      customJsonTemplate: "{ \"code\": 0, \"data\": <aiData/> }",
      sseDataEvents: ["message"]
    }]
  }, { "x-proxy2localai-token": token });

  const response = await httpJson(baseUrl, "POST", `/proxy/custom-json?token=${token}`, { q: "hello" });

  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(JSON.parse(response.body)).toEqual({ code: 0, data: "你好" });
});

it("returns ai data as json value when custom json template is empty", async () => {
  const fakeProvider: AiProviderAdapter = {
    async generateText() {
      return "unused";
    },
    async *streamText() {
      yield "unused";
    },
    async generateRawText() {
      return "plain text";
    }
  };
  const server = createTestBridgeServer({
    token,
    providers: { claude: fakeProvider }
  });
  const baseUrl = await listen(server);

  await httpJson(baseUrl, "PUT", "/admin/profiles", {
    profiles: [{
      id: "custom-json-empty",
      name: "Custom JSON Empty",
      targetOrigin: "https://api.example.com",
      targetPath: "/chat",
      projectDir: "C:/work",
      responseMode: "custom_json"
    }]
  }, { "x-proxy2localai-token": token });

  const response = await httpJson(baseUrl, "POST", `/proxy/custom-json-empty?token=${token}`, { q: "hello" });

  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toBe("plain text");
});
```

**Step 2: Run tests to verify they fail**

Run:

```powershell
npm test -- apps/bridge/src/server.test.ts
```

Expected: FAIL because bridge does not handle `custom_json`.

**Step 3: Add bridge custom JSON branch**

In `server.ts`, import helpers:

```ts
import {
  extractAiData,
  renderCustomJsonTemplate,
  validateCustomJsonTemplate
} from "@proxy2localai/shared";
```

Before the existing `stream` branch:

```ts
if (profile.responseMode === "custom_json") {
  await customJsonResponse(res, profile, provider, prompt, context.requestsLogPath);
  return;
}
```

Add:

```ts
async function customJsonResponse(
  res: ServerResponse,
  profile: ProxyProfile,
  provider: AiProviderAdapter,
  prompt: string,
  requestsLogPath: string
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
  logRequestEvent(requestsLogPath, {
    stage: "provider_done",
    profileId: profile.id,
    provider: profile.provider,
    responseMode: profile.responseMode,
    outputChars: aiData.length
  });
  sendRawJson(res, 200, body);
}
```

Add `sendRawJson`:

```ts
function sendRawJson(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  res.end(body);
}
```

**Step 4: Run focused tests**

Run:

```powershell
npm test -- apps/bridge/src/server.test.ts packages/shared/src/responseTemplate.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add apps/bridge/src/server.ts apps/bridge/src/server.test.ts
git commit -m "feat: support custom json responses"
```

### Task 7: Add Extension UI For Enable/Disable And Custom JSON Settings

**Files:**
- Modify: `apps/extension/src/options/main.tsx`
- Modify: `apps/extension/src/popup/main.tsx`
- Modify: `apps/extension/src/ui.css`
- Modify: `apps/extension/src/lib/rules.test.ts`

**Step 1: Write or update tests for DNR enabled behavior**

`apps/extension/src/lib/rules.test.ts` already verifies disabled profiles are excluded. Add a focused test for toggling output count:

```ts
it("does not build redirect rules for disabled profiles", () => {
  const rules = buildDynamicRules({
    bridgeBaseUrl: "http://127.0.0.1:39399",
    token: "token",
    profiles: [{
      id: "disabled",
      name: "Disabled",
      enabled: false,
      targetOrigin: "https://api.example.com",
      targetPath: "/chat",
      methods: ["POST"],
      projectDir: "C:/work",
      provider: "claude",
      responseMode: "custom_json",
      timeoutMs: 0,
      maxBodyBytes: 0,
      sseDataEvents: ["message"]
    }]
  });

  expect(rules).toEqual([]);
});
```

**Step 2: Run test**

Run:

```powershell
npm test -- apps/extension/src/lib/rules.test.ts
```

Expected: PASS or fail only because new required fields are not yet handled in test fixtures.

**Step 3: Add options page toggle handler**

In `OptionsApp`, add:

```ts
const toggleProfileEnabled = useCallback(async (profile: ProxyProfile) => {
  if (!config) {
    return;
  }
  const nextProfile = { ...profile, enabled: !profile.enabled };
  if (nextProfile.enabled) {
    const granted = await requestProfilePermission(nextProfile);
    if (!granted) {
      setStatus("目标域名权限未授予");
      return;
    }
  }
  const saved = await persistConfig({
    ...config,
    profiles: config.profiles.map((item) => item.id === profile.id ? nextProfile : item)
  });
  if (selectedId === profile.id) {
    setDraft(profileToDraft(saved.profiles.find((item) => item.id === profile.id) ?? nextProfile));
  }
  setStatus(nextProfile.enabled ? "配置已启动" : "配置已关闭");
}, [config, persistConfig, selectedId]);
```

In the profile list item, add a secondary button:

```tsx
<button
  type="button"
  className="secondary"
  onClick={(event) => {
    event.stopPropagation();
    void toggleProfileEnabled(profile).catch((error) => setStatus(error instanceof Error ? error.message : "切换失败"));
  }}
>
  {profile.enabled ? "关闭" : "启动"}
</button>
```

Keep the existing editor checkbox for detailed editing.

**Step 4: Add custom JSON fields in options form**

Add option:

```tsx
<option value="custom_json">自定义 JSON</option>
```

Show fields when selected:

```tsx
{draft.responseMode === "custom_json" && (
  <section className="custom-json-panel">
    <label>
      提取 SSE 事件名
      <textarea
        value={draft.sseDataEvents}
        placeholder="message"
        onChange={(event) => updateDraft("sseDataEvents", event.target.value)}
      />
      <small>每行或逗号分隔一个事件名，默认 message。</small>
    </label>
    <label>
      JSON 返回模板
      <textarea
        value={draft.customJsonTemplate}
        placeholder="{ &quot;code&quot;: 0, &quot;data&quot;: <aiData/> }"
        onChange={(event) => updateDraft("customJsonTemplate", event.target.value)}
      />
      <small>使用 &lt;aiData/&gt; 表示聚合后的端侧 AI 数据；留空则直接返回 AI 数据。</small>
    </label>
  </section>
)}
```

**Step 5: Add popup quick toggle**

In popup, add a `toggleProfileEnabled` using `storage.save` and `syncBridgeThenApplyRules`, mirroring options page but without permission prompt unless enabling. If permission prompt is not available in popup context, open options page for enabling and allow popup only to disable.

Recommended minimal behavior:

```tsx
<button
  type="button"
  className="secondary"
  onClick={() => chrome.runtime.openOptionsPage()}
>
  启停
</button>
```

Use options page for actual toggle to keep permission handling in one place.

**Step 6: Update CSS**

Add:

```css
.profile-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.custom-json-panel {
  display: grid;
  gap: 12px;
  border: 1px solid #dbe2e7;
  border-radius: 8px;
  background: #f9fbfc;
  padding: 12px;
}
```

**Step 7: Run tests**

Run:

```powershell
npm test -- apps/extension/src/lib/rules.test.ts apps/extension/src/options/profileForm.test.ts
```

Expected: PASS.

**Step 8: Commit**

```powershell
git add apps/extension/src/options/main.tsx apps/extension/src/popup/main.tsx apps/extension/src/ui.css apps/extension/src/lib/rules.test.ts
git commit -m "feat: add profile toggles and custom json settings"
```

### Task 8: Validate Real Proxy Path With A Local Reproduction

**Files:**
- Modify: `README.md`
- Optional Create: `doc/proxy-diagnostics.md`

**Step 1: Add manual reproduction checklist**

Create `doc/proxy-diagnostics.md` with:

```md
# 代理无响应定位清单

1. 确认 bridge 在线：`Invoke-RestMethod http://127.0.0.1:39399/health`。
2. 确认配置已同步：`Invoke-RestMethod "http://127.0.0.1:39399/admin/profiles?token=proxy2localai-local-token"`。
3. 直接请求 bridge：`Invoke-WebRequest -Method POST "http://127.0.0.1:39399/proxy/<profileId>?token=proxy2localai-local-token" -ContentType "application/json" -Body "{}"`。
4. 查看日志：`Get-Content -Wait -Tail 80 apps/bridge/data/requests.log`。
5. 若有 `provider_done` 但没有 `response_done_written`，定位 bridge 写回。
6. 若有 `response_done_written` 但业务页面无结果，定位响应格式是否符合目标页面预期。
7. 若没有 `request_received`，定位 DNR 规则、域名权限、请求 URL 和 HTTP 方法是否匹配。
```

Add a short link from `README.md` troubleshooting section to this checklist.

**Step 2: Run docs sanity check**

Run:

```powershell
Get-Content -Raw doc/proxy-diagnostics.md
```

Expected: file exists and commands are readable.

**Step 3: Commit**

```powershell
git add README.md doc/proxy-diagnostics.md
git commit -m "docs: add proxy diagnostics checklist"
```

### Task 9: Full Verification

**Files:**
- All modified files.

**Step 1: Run full tests**

Run:

```powershell
npm test
```

Expected: all test files pass.

**Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: all workspaces typecheck successfully.

**Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: shared, bridge, and extension build successfully.

**Step 4: Manual smoke test**

Run bridge:

```powershell
npm run build
npm run start:bridge
```

In another PowerShell window, inspect health:

```powershell
Invoke-RestMethod http://127.0.0.1:39399/health
```

Expected: `{ ok: true, service: "proxy2localai-bridge", profileCount: <number> }`.

Then test direct proxy call for the configured profile:

```powershell
Invoke-WebRequest `
  -Method POST `
  -Uri "http://127.0.0.1:39399/proxy/<profileId>?token=proxy2localai-local-token" `
  -ContentType "application/json" `
  -Body "{}"
```

Expected:
- For `stream`: response body contains `data:` chunks and `data: [DONE]`.
- For `custom_json`: response body is valid JSON matching the configured template.
- `apps/bridge/data/requests.log` contains `request_received`, `profile_matched`, `provider_done`, and a response write completion stage.

**Step 5: Final commit**

```powershell
git status --short
git add .
git commit -m "feat: add proxy diagnostics and custom json responses"
```

Only run this final commit if prior task commits were not created separately.

