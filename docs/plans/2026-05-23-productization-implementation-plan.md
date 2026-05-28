# Proxy2LocalAI Productization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `2026-05-23-productization-design.md` 落地为分阶段产品化能力，让新用户能快速创建代理、失败时能在 UI 里定位原因，并通过模板复用复杂响应协议。

**Architecture:** 保持现有 npm workspaces 三层结构：`packages/shared` 承载类型、模板、解析和脱敏纯函数；`apps/bridge` 承载本地服务、请求诊断、provider 测试和响应执行；`apps/extension` 承载向导、配置分层、最近请求调试台和模板选择。所有新增行为先用 Vitest 写失败测试，再做最小实现，避免一次性重写 Options 页面。

**Tech Stack:** TypeScript, Node.js HTTP server, Chrome MV3, React 19, Vite, tsup, Vitest.

---

## Recommended Route

推荐路线：**P0 -> P1 -> P2 -> P3**。

推荐理由：P0 先解决“第一次成功”，能尽快改善产品主路径；P1 再补“失败可解释”，否则模板系统越复杂越难排障；P2 把已经存在的 `custom_json` 和 `mapped_sse` 能力产品化；P3 最后处理安装包和跨平台启动器，避免过早投入发布工程。

备选路线：

- **P1 -> P0 -> P2 -> P3**：适合当前请求失败很多、先救排障体验；缺点是新用户主路径仍然复杂。
- **P0 + P1 并行**：适合多人协作；缺点是会同时改 `server.ts`、`bridgeApi.ts`、`Options` 状态结构，冲突概率高。

本计划采用推荐路线，并在每个阶段结束后运行：

```bash
npm test
npm run typecheck
npm run build
```

---

## Phase P0: 让用户第一次成功

### Task 1: 扩展 Profile 产品化字段

**Files:**
- Modify: `packages/shared/src/profile.ts`
- Modify: `packages/shared/src/configFile.ts`
- Test: `packages/shared/src/profile.test.ts`
- Test: `packages/shared/src/configFile.test.ts`

**Step 1: Write the failing tests**

新增 `packages/shared/src/profile.test.ts`，覆盖新增字段默认值和导入兼容：

```ts
import { describe, expect, test } from "vitest";
import { normalizeProfile } from "./profile";

const baseProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
  provider: "claude",
  responseMode: "stream",
  timeoutMs: 0,
  maxBodyBytes: 0
};

describe("产品化 profile 字段", () => {
  test("旧配置导入时补齐产品化字段默认值", () => {
    const profile = normalizeProfile(baseProfile);

    expect(profile.setupMode).toBe("advanced");
    expect(profile.responseTemplateId).toBe("openai_sse");
    expect(profile.sensitiveHeaderPolicy).toBe("default");
    expect(profile.debugEnabled).toBe(true);
    expect(profile.lastTestResult).toBeUndefined();
  });
});
```

在 `configFile.test.ts` 增加分享模板导出断言：

```ts
expect(exported.config.profiles[0]?.lastTestResult).toBeUndefined();
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run packages/shared/src/profile.test.ts packages/shared/src/configFile.test.ts
```

Expected: FAIL，因为 `setupMode`、`responseTemplateId`、`sensitiveHeaderPolicy`、`debugEnabled` 尚不存在。

**Step 3: Implement minimal model changes**

在 `ProxyProfile` 增加：

```ts
export type SetupMode = "wizard" | "advanced";
export type SensitiveHeaderPolicy = "default" | "allow_all" | "custom";

export interface LastTestResult {
  ok: boolean;
  testedAt: string;
  stage: string;
  message: string;
}
```

字段：

```ts
setupMode: SetupMode;
responseTemplateId: string;
sensitiveHeaderPolicy: SensitiveHeaderPolicy;
debugEnabled: boolean;
lastTestResult?: LastTestResult;
```

默认值：

```ts
setupMode: "advanced";
responseTemplateId: input.responseTemplateId ?? defaultTemplateForResponseMode(responseMode);
sensitiveHeaderPolicy: "default";
debugEnabled: true;
```

分享模板导出时移除 `lastTestResult`，保持 token、本地路径已有脱敏逻辑。

**Step 4: Verify**

Run:

```bash
npx vitest run packages/shared/src/profile.test.ts packages/shared/src/configFile.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/profile.ts packages/shared/src/configFile.ts packages/shared/src/profile.test.ts packages/shared/src/configFile.test.ts
git commit -m "feat: add productization profile fields"
```

---

### Task 2: 抽出可复用 cURL 解析器

**Files:**
- Create: `packages/shared/src/curl.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/extension/src/options/profileForm.ts`
- Test: `packages/shared/src/curl.test.ts`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Step 1: Write the failing tests**

`packages/shared/src/curl.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseCurlCommand } from "./curl";

describe("cURL 解析", () => {
  test("解析 URL、方法、请求头和请求体样例", () => {
    const parsed = parseCurlCommand(`curl 'https://api.example.com/v1/chat/completions?debug=1' \\
      -H 'content-type: application/json' \\
      -H 'authorization: Bearer secret' \\
      --data-raw '{"messages":[{"role":"user","content":"hi"}]}'`);

    expect(parsed.url).toBe("https://api.example.com/v1/chat/completions?debug=1");
    expect(parsed.method).toBe("POST");
    expect(parsed.headers["content-type"]).toBe("application/json");
    expect(parsed.headers.authorization).toBe("Bearer secret");
    expect(parsed.body).toBe('{"messages":[{"role":"user","content":"hi"}]}');
  });
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run packages/shared/src/curl.test.ts
```

Expected: FAIL，因为 `curl.ts` 不存在。

**Step 3: Implement minimal parser**

把 `apps/extension/src/options/profileForm.ts` 里的 `tokenizeCurl`、`normalizeCurlMethod`、body/header flag 解析迁移到 `packages/shared/src/curl.ts`，导出：

```ts
export interface ParsedCurl {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}
```

`applyCurlToDraft` 改为使用 shared parser，并保留当前自动填充 `name`、`targetOrigin`、`targetPath`、`methods` 行为。

**Step 4: Verify**

Run:

```bash
npx vitest run packages/shared/src/curl.test.ts apps/extension/src/options/profileForm.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/curl.ts packages/shared/src/index.ts apps/extension/src/options/profileForm.ts packages/shared/src/curl.test.ts apps/extension/src/options/profileForm.test.ts
git commit -m "feat: add reusable curl parser"
```

---

### Task 3: 建立 Options 基础布局分层

**Files:**
- Create: `apps/extension/src/options/components/BridgeStatusBar.tsx`
- Create: `apps/extension/src/options/components/ProfileList.tsx`
- Create: `apps/extension/src/options/components/ProfileEditor.tsx`
- Modify: `apps/extension/src/options/main.tsx`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Step 1: Write the failing test**

先增加纯函数测试，避免 UI 大重构无保护：

```ts
import { getDefaultExpandedSections } from "./profileForm";

test("基础模式默认只展开基础配置", () => {
  expect(getDefaultExpandedSections("wizard")).toEqual(["basic"]);
  expect(getDefaultExpandedSections("advanced")).toEqual(["basic", "advanced"]);
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/extension/src/options/profileForm.test.ts
```

Expected: FAIL，因为 `getDefaultExpandedSections` 尚不存在。

**Step 3: Implement minimal layout split**

新增纯函数：

```ts
export type ProfileSection = "basic" | "advanced" | "expert";
```

`OptionsApp` 保持现有状态逻辑，先只把 JSX 拆成组件，不改变行为：

- `BridgeStatusBar`：显示 Bridge 在线状态、同步、doctor。
- `ProfileList`：左侧 profile 列表和新增按钮。
- `ProfileEditor`：基础、高级、专家三段折叠区域。

基础配置包含：名称、启用、目标接口、HTTP 方法、本地 AI、项目路径、返回格式、提示词。

高级配置包含：超时、请求体上限、上下文正则、多轮记忆、provider 追加参数、敏感字段过滤。

专家配置包含：custom provider、自定义 JSON、SSE 映射、危险 CLI 权限。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/extension/src/options/profileForm.test.ts
npm run build -w @proxy2localai/extension
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/options/main.tsx apps/extension/src/options/components apps/extension/src/options/profileForm.ts apps/extension/src/options/profileForm.test.ts
git commit -m "feat: reorganize options profile editor"
```

---

### Task 4: 创建首次上手向导

**Files:**
- Create: `apps/extension/src/options/components/CreateProxyWizard.tsx`
- Modify: `apps/extension/src/options/main.tsx`
- Modify: `apps/extension/src/options/profileForm.ts`
- Modify: `apps/extension/src/lib/bridgeApi.ts`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Step 1: Write the failing test**

```ts
import { createWizardProfileFromCurl } from "./profileForm";

test("向导从 cURL 创建默认 OpenAI SSE 代理配置", () => {
  const draft = createWizardProfileFromCurl(
    "curl 'https://api.example.com/v1/chat/completions' --json '{\"messages\":[]}'",
    "C:/project/demoProject/proxy2LocalAI"
  );

  expect(draft.setupMode).toBe("wizard");
  expect(draft.provider).toBe("claude");
  expect(draft.responseMode).toBe("stream");
  expect(draft.responseTemplateId).toBe("openai_sse");
  expect(draft.projectDir).toBe("C:/project/demoProject/proxy2LocalAI");
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/extension/src/options/profileForm.test.ts
```

Expected: FAIL，因为 `createWizardProfileFromCurl` 尚不存在。

**Step 3: Implement wizard**

向导步骤：

1. Bridge 状态：调用 `getBridgeHealth`；离线时展示 `.\scripts\start-bridge.ps1`、`scripts/start-bridge.sh`。
2. 粘贴 cURL：调用 shared cURL parser。
3. 选择 AI：默认 Claude Code。
4. 选择项目路径。
5. 选择返回格式：默认 OpenAI SSE。
6. 保存并同步。

暂不实现真实代理测试按钮，留给 Task 5。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/extension/src/options/profileForm.test.ts
npm run build -w @proxy2localai/extension
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/options/components/CreateProxyWizard.tsx apps/extension/src/options/main.tsx apps/extension/src/options/profileForm.ts apps/extension/src/options/profileForm.test.ts
git commit -m "feat: add create proxy wizard"
```

---

### Task 5: 增加测试代理接口和按钮

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/server.test.ts`
- Modify: `apps/extension/src/lib/bridgeApi.ts`
- Modify: `apps/extension/src/options/components/CreateProxyWizard.tsx`
- Modify: `apps/extension/src/options/components/ProfileEditor.tsx`

**Step 1: Write the failing bridge test**

```ts
test("POST /admin/test-profile/:profileId 执行一次测试代理并返回阶段摘要", async () => {
  const response = await fetch(`${baseUrl}/admin/test-profile/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-proxy2localai-token": "test-token"
    },
    body: JSON.stringify({
      sample: {
        headers: { "content-type": "application/json" },
        body: { messages: [{ role: "user", content: "ping" }] }
      }
    })
  });

  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({
    ok: true,
    stages: expect.arrayContaining([
      expect.objectContaining({ id: "profile_matched", status: "ok" }),
      expect.objectContaining({ id: "provider_done", status: "ok" })
    ])
  });
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/bridge/src/server.test.ts
```

Expected: FAIL with 404.

**Step 3: Implement minimal endpoint**

新增 `POST /admin/test-profile/:profileId`：

- 鉴权沿用 token。
- 从 profile 构造 `RequestParameters`。
- 调 provider，返回阶段摘要。
- 不写入长期日志；可写入后续 P1 的内存诊断。

Extension `bridgeApi.ts` 增加：

```ts
export async function testBridgeProfile(config: AppConfig, profileId: string, sample: TestProfileSample): Promise<TestProfileResult>
```

**Step 4: Verify**

Run:

```bash
npx vitest run apps/bridge/src/server.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/bridge/src/server.ts apps/bridge/src/server.test.ts apps/extension/src/lib/bridgeApi.ts apps/extension/src/options/components
git commit -m "feat: add profile test endpoint"
```

---

## Phase P1: 让失败可解释

### Task 6: 建立诊断事件模型和内存存储

**Files:**
- Create: `packages/shared/src/diagnostics.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/bridge/src/diagnostics.ts`
- Test: `apps/bridge/src/diagnostics.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { createDiagnosticsStore } from "./diagnostics";

test("只保留最近 20 条请求摘要", () => {
  const store = createDiagnosticsStore({ limit: 20 });
  for (let index = 0; index < 21; index += 1) {
    store.startRequest({ id: `req-${index}`, method: "POST", targetUrl: `https://example.com/${index}` });
    store.finishRequest(`req-${index}`, { status: "ok" });
  }

  expect(store.listRecent()).toHaveLength(20);
  expect(store.listRecent()[0]?.id).toBe("req-1");
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/bridge/src/diagnostics.test.ts
```

Expected: FAIL because file does not exist.

**Step 3: Implement store**

`packages/shared/src/diagnostics.ts` 定义：

- `DiagnosticStageId`
- `DiagnosticStageStatus`
- `RequestDiagnosticSummary`
- `RequestDiagnosticDetail`
- `DiagnosticExport`

`apps/bridge/src/diagnostics.ts` 实现内存 ring buffer，默认 20 条。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/bridge/src/diagnostics.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/diagnostics.ts packages/shared/src/index.ts apps/bridge/src/diagnostics.ts apps/bridge/src/diagnostics.test.ts
git commit -m "feat: add request diagnostics store"
```

---

### Task 7: Bridge 接入诊断阶段

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/server.test.ts`
- Modify: `apps/bridge/src/providers.ts`

**Step 1: Write the failing tests**

新增测试覆盖失败归因：

```ts
test("provider 无有效输出时记录 provider_no_output 阶段", async () => {
  const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" })
  });

  expect(response.status).toBe(500);

  const recent = await fetch(`${baseUrl}/diagnostics/recent?token=test-token`);
  const body = await recent.json();
  expect(body.items[0].finalStatus).toBe("error");
  expect(body.items[0].errorStage).toBe("provider_no_output");
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/bridge/src/server.test.ts
```

Expected: FAIL，因为诊断接口和阶段尚未接入。

**Step 3: Implement instrumentation**

在 `createBridgeServer` 初始化 diagnostics store。每次 `/proxy/:profileId`：

- `request_received`
- `profile_matched`
- `cors_preflight` if OPTIONS
- `provider_spawn`
- `provider_first_output`
- `provider_done`
- `response_mapped`
- `response_done`
- error stage

不要把完整 token、authorization、cookie、完整 prompt 存入明文诊断。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/bridge/src/server.test.ts apps/bridge/src/diagnostics.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/bridge/src/server.ts apps/bridge/src/providers.ts apps/bridge/src/server.test.ts apps/bridge/src/diagnostics.ts apps/bridge/src/diagnostics.test.ts
git commit -m "feat: record proxy diagnostic stages"
```

---

### Task 8: 新增诊断 API 和脱敏导出

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/server.test.ts`
- Create: `packages/shared/src/redaction.ts`
- Test: `packages/shared/src/redaction.test.ts`

**Step 1: Write failing tests**

`redaction.test.ts`:

```ts
import { redactDiagnosticText } from "./redaction";

test("导出诊断时脱敏 token、authorization 和 cookie", () => {
  const text = redactDiagnosticText("authorization: Bearer abc\ncookie: sid=123\ntoken=test");

  expect(text).not.toContain("Bearer abc");
  expect(text).not.toContain("sid=123");
  expect(text).toContain("[REDACTED]");
});
```

Bridge test:

```ts
const detail = await fetch(`${baseUrl}/diagnostics/recent/${requestId}?token=test-token`);
expect(detail.status).toBe(200);
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run packages/shared/src/redaction.test.ts apps/bridge/src/server.test.ts
```

Expected: FAIL.

**Step 3: Implement endpoints**

新增：

- `GET /diagnostics/recent`
- `GET /diagnostics/recent/:requestId`
- `GET /diagnostics/recent/:requestId/export`

全部鉴权。导出返回 `text/plain; charset=utf-8`，内容经过脱敏。

**Step 4: Verify**

Run:

```bash
npx vitest run packages/shared/src/redaction.test.ts apps/bridge/src/server.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/redaction.ts packages/shared/src/redaction.test.ts apps/bridge/src/server.ts apps/bridge/src/server.test.ts
git commit -m "feat: expose recent request diagnostics"
```

---

### Task 9: Options 最近请求调试台

**Files:**
- Modify: `apps/extension/src/lib/bridgeApi.ts`
- Create: `apps/extension/src/options/components/RecentRequestsPanel.tsx`
- Modify: `apps/extension/src/options/main.tsx`
- Modify: `apps/extension/src/popup/main.tsx`

**Step 1: Write the failing API adapter tests**

如果不引入 React 测试库，先测试请求构造纯函数：

```ts
import { createBridgeUrl } from "../lib/bridgeApi";

test("构造最近请求 URL", () => {
  expect(createBridgeUrl("http://127.0.0.1:39399", "/diagnostics/recent").href)
    .toBe("http://127.0.0.1:39399/diagnostics/recent");
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/extension/src/lib/bridgeApi.test.ts
```

Expected: FAIL.

**Step 3: Implement UI**

`bridgeApi.ts` 增加：

- `getRecentDiagnostics(config)`
- `getDiagnosticDetail(config, requestId)`
- `exportDiagnostic(config, requestId)`

`RecentRequestsPanel` 显示：

- 时间、profile、method、原始 URL、page URL、返回模式、最终状态、耗时。
- 详情显示 prompt 预览、provider 命令摘要、stdout 阶段摘要、错误归因。
- 复制诊断信息按钮。

Popup 增加最近一次请求状态和打开最近请求入口。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/extension/src/lib/bridgeApi.test.ts
npm run build -w @proxy2localai/extension
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/lib/bridgeApi.ts apps/extension/src/options/components/RecentRequestsPanel.tsx apps/extension/src/options/main.tsx apps/extension/src/popup/main.tsx
git commit -m "feat: add recent request diagnostics panel"
```

---

### Task 10: Provider 轻量检测与实际检测

**Files:**
- Modify: `apps/bridge/src/doctor.ts`
- Modify: `apps/bridge/src/providers.ts`
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/doctor.test.ts`
- Modify: `apps/bridge/src/server.test.ts`
- Modify: `apps/extension/src/lib/bridgeApi.ts`
- Modify: `apps/extension/src/options/components/ProfileEditor.tsx`

**Step 1: Write failing tests**

Doctor test:

```ts
test("provider 轻量检测返回命令和项目目录状态", () => {
  const report = createDoctorReport({
    port: 39399,
    tokenSource: "PROXY2LOCALAI_TOKEN",
    profilesPath: "C:/tmp/profiles.json",
    requestsLogPath: "C:/tmp/requests.log",
    profiles: [{ ...baseProfile, provider: "codex" }],
    commandExists: () => ({ ok: true, path: "C:/bin/codex.exe" }),
    canWriteDataPath: () => true
  });

  expect(report.checks.some((check) => check.id === "provider:codex")).toBe(true);
});
```

Server test for actual provider:

```ts
test("POST /admin/test-provider/:profileId 返回实际输出摘要", async () => {
  const response = await fetch(`${baseUrl}/admin/test-provider/chat`, {
    method: "POST",
    headers: { "x-proxy2localai-token": "test-token" }
  });
  expect(response.ok).toBe(true);
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/bridge/src/doctor.test.ts apps/bridge/src/server.test.ts
```

Expected: server endpoint FAIL.

**Step 3: Implement**

- 轻量检测继续走 `/doctor`。
- 实际检测新增 `POST /admin/test-provider/:profileId`，发送最小 prompt。
- UI 用“轻量检测”和“实际测试”两个按钮区分是否消耗模型额度。
- Custom provider 显示本地命令执行风险文案。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/bridge/src/doctor.test.ts apps/bridge/src/server.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/bridge/src/doctor.ts apps/bridge/src/providers.ts apps/bridge/src/server.ts apps/extension/src/lib/bridgeApi.ts apps/extension/src/options/components/ProfileEditor.tsx
git commit -m "feat: add provider test actions"
```

---

## Phase P2: 让通用性可用

### Task 11: 内置响应模板系统

**Files:**
- Create: `packages/shared/src/responseTemplates.ts`
- Modify: `packages/shared/src/responseTemplate.ts`
- Modify: `packages/shared/src/profile.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/responseTemplates.test.ts`

**Step 1: Write failing tests**

```ts
import { getBuiltinResponseTemplate, applyResponseTemplateToProfile } from "./responseTemplates";

test("内置通用 SSE 模板设置 mapped_sse 默认映射", () => {
  const template = getBuiltinResponseTemplate("generic_sse");
  const profile = applyResponseTemplateToProfile(baseProfile, template);

  expect(profile.responseMode).toBe("mapped_sse");
  expect(profile.sseEventMappings).toEqual([
    { source: "reasoning", targetEvent: "reasoning" },
    { source: "message", targetEvent: "message" }
  ]);
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run packages/shared/src/responseTemplates.test.ts
```

Expected: FAIL.

**Step 3: Implement builtin templates**

至少内置：

- `openai_chat_json` -> `block`
- `openai_sse` -> `stream`
- `business_code_data_message` -> `custom_json`
- `generic_sse` -> `mapped_sse`

模板字段：

```ts
id;
name;
responseMode;
description;
customJsonTemplate?;
sseEventMappings?;
sseDoneEvent?;
examplePreview;
```

**Step 4: Verify**

Run:

```bash
npx vitest run packages/shared/src/responseTemplates.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/responseTemplates.ts packages/shared/src/responseTemplate.ts packages/shared/src/profile.ts packages/shared/src/index.ts packages/shared/src/responseTemplates.test.ts
git commit -m "feat: add builtin response templates"
```

---

### Task 12: Options 模板选择与预览

**Files:**
- Modify: `apps/extension/src/options/profileForm.ts`
- Modify: `apps/extension/src/options/components/ProfileEditor.tsx`
- Create: `apps/extension/src/options/components/ResponseTemplatePicker.tsx`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Step 1: Write failing test**

```ts
import { applyTemplateToDraft } from "./profileForm";

test("选择通用 SSE 模板时更新返回类型和映射字段", () => {
  const draft = createBlankProfile();
  const next = applyTemplateToDraft(draft, "generic_sse");

  expect(next.responseTemplateId).toBe("generic_sse");
  expect(next.responseMode).toBe("mapped_sse");
  expect(next.sseEventMappings).toContain("reasoning=reasoning");
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/extension/src/options/profileForm.test.ts
```

Expected: FAIL.

**Step 3: Implement picker**

`ResponseTemplatePicker` 显示模板名称、适用类型、示例预览。选择模板后同步更新 draft 的 responseMode 和相关字段。

自定义 JSON、SSE 映射字段保留在专家配置中，模板选择只做预填，不锁死用户编辑。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/extension/src/options/profileForm.test.ts
npm run build -w @proxy2localai/extension
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/extension/src/options/profileForm.ts apps/extension/src/options/components/ResponseTemplatePicker.tsx apps/extension/src/options/components/ProfileEditor.tsx apps/extension/src/options/profileForm.test.ts
git commit -m "feat: add response template picker"
```

---

### Task 13: 从真实响应样例生成模板

**Files:**
- Modify: `packages/shared/src/responseTemplates.ts`
- Test: `packages/shared/src/responseTemplates.test.ts`
- Modify: `apps/extension/src/options/components/ResponseTemplatePicker.tsx`

**Step 1: Write failing tests**

```ts
import { inferResponseTemplateFromSample } from "./responseTemplates";

test("从 event:message/event:done SSE 样例推断 mapped_sse 模板", () => {
  const template = inferResponseTemplateFromSample('event:message\\ndata:"hi"\\n\\nevent:done\\ndata:{}\\n\\n');

  expect(template.responseMode).toBe("mapped_sse");
  expect(template.sseEventMappings).toEqual([{ source: "message", targetEvent: "message" }]);
});

test("从 code/data/message JSON 样例推断 custom_json 模板", () => {
  const template = inferResponseTemplateFromSample('{"code":0,"data":"hi","message":"ok"}');

  expect(template.responseMode).toBe("custom_json");
  expect(template.customJsonTemplate).toContain("<aiData/>");
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run packages/shared/src/responseTemplates.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal inference**

规则：

- 包含 `event:` 或 `data:` -> SSE 样例，提取 event 名。
- 合法 JSON 且包含 `data` -> `custom_json`。
- 其他文本 -> `block`。

避免复杂 AST 生成，先覆盖最常见结构。

**Step 4: Verify**

Run:

```bash
npx vitest run packages/shared/src/responseTemplates.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/responseTemplates.ts packages/shared/src/responseTemplates.test.ts apps/extension/src/options/components/ResponseTemplatePicker.tsx
git commit -m "feat: infer response template from sample"
```

---

## Phase P3: 让安装更像产品

### Task 14: Bridge 和 Extension 版本兼容检查

**Files:**
- Modify: `apps/bridge/src/server.ts`
- Modify: `apps/bridge/src/server.test.ts`
- Modify: `apps/extension/src/lib/bridgeApi.ts`
- Modify: `apps/extension/src/options/components/BridgeStatusBar.tsx`
- Modify: `apps/extension/src/popup/main.tsx`

**Step 1: Write failing test**

```ts
test("/health 返回 bridge 版本和协议版本", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  expect(body.version).toMatch(/^0\\.1\\./);
  expect(body.protocolVersion).toBe(1);
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run apps/bridge/src/server.test.ts
```

Expected: FAIL.

**Step 3: Implement**

Bridge `/health` 返回：

```ts
version;
protocolVersion;
profileCount;
```

Extension 显示版本兼容状态。协议版本不匹配时提示升级 Bridge 或扩展。

**Step 4: Verify**

Run:

```bash
npx vitest run apps/bridge/src/server.test.ts
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/bridge/src/server.ts apps/bridge/src/server.test.ts apps/extension/src/lib/bridgeApi.ts apps/extension/src/options/components/BridgeStatusBar.tsx apps/extension/src/popup/main.tsx
git commit -m "feat: add bridge compatibility status"
```

---

### Task 15: Release 包和启动脚本产品化

**Files:**
- Modify: `scripts/release.mjs`
- Modify: `scripts/start-bridge.ps1`
- Modify: `scripts/start-bridge.cmd`
- Modify: `scripts/start-bridge.sh`
- Modify: `README.md`
- Modify: `docs/proxy-diagnostics.md`

**Step 1: Write failing release smoke test**

如果当前项目没有脚本测试框架，新增 `scripts/release.test.mjs` 不是首选。推荐先把 release 纯函数抽到：

- Create: `scripts/release-utils.mjs`
- Test: `scripts/release-utils.test.mjs`

测试：

```js
import { strict as assert } from "node:assert";
import { getReleasePackageNames } from "./release-utils.mjs";

assert.deepEqual(getReleasePackageNames("0.1.0"), [
  "proxy2localai-extension-0.1.0.zip",
  "proxy2localai-bridge-0.1.0.zip"
]);
```

**Step 2: Run tests to verify failure**

Run:

```bash
node scripts/release-utils.test.mjs
```

Expected: FAIL until helper exists.

**Step 3: Implement**

- Release 包名带版本号。
- Bridge 包含启动脚本、doctor 脚本、README 摘要。
- 启动脚本在失败时提示 Node 版本和 `npm run doctor`。
- 文档补充 Windows/macOS/Linux 启动步骤。

**Step 4: Verify**

Run:

```bash
node scripts/release-utils.test.mjs
npm run build
npm run release
```

Expected: PASS and generated release artifacts.

**Step 5: Commit**

```bash
git add scripts/release.mjs scripts/release-utils.mjs scripts/release-utils.test.mjs scripts/start-bridge.ps1 scripts/start-bridge.cmd scripts/start-bridge.sh README.md docs/proxy-diagnostics.md
git commit -m "chore: improve release packaging"
```

---

## Cross-Phase Acceptance Checklist

每个阶段结束必须确认：

- `npm test` 通过。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- Options 页面在扩展构建产物中可打开。
- 不新增默认危险 CLI 权限。
- 导出模板不包含 token、本地路径、`lastTestResult` 或诊断明文。

P0 验收：

- 新用户可以从 cURL 创建 profile。
- Bridge 未启动时 UI 显示启动命令。
- 可以执行一次测试代理并看到阶段结果。
- 基础、高级、专家配置分层展示。

P1 验收：

- 最近 20 条请求可在 UI 查看。
- 失败能归因到明确阶段。
- 诊断导出前已脱敏。
- 能区分“没命中规则”和“AI 没返回”。

P2 验收：

- 至少 4 个内置模板可选。
- `custom_json` 和 `mapped_sse` 可以通过模板预填。
- 真实响应样例能生成可预览模板。

P3 验收：

- Release 包名、内容和启动脚本清晰。
- Bridge 与扩展显示版本兼容状态。
- README 能指导普通用户完成安装和自检。

---

## Open Questions Before Execution

1. P0 的向导是否默认创建并启用 profile，还是先创建为停用，测试通过后再启用？
2. 诊断信息是否允许保存完整 prompt 预览，还是只保存脱敏摘要？
3. Provider “实际测试”默认是否允许调用模型，还是必须二次确认？
4. P3 是否优先支持 Windows，macOS/Linux 只保证脚本文案可用？

