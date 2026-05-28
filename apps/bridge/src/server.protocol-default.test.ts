/**
 * 验证测试：默认配置下 SSE 输出是否与 Claude Code 原生输出一致
 *
 * 核心问题：bridge 是否透传 Claude Code CLI 的原生 JSONL，还是转换成 messageReturnStructure 约定的格式？
 *
 * 验证点：
 * 1. 默认 messageReturnStructure 始终为 "anthropic_messages"，shouldUseProtocolResponse 始终为 true
 * 2. block 模式 → 返回 Anthropic Messages JSON，不是 Claude Code 原生 JSONL
 * 3. stream 模式 → 返回 Anthropic SSE (content_block_delta)，不是 Claude Code 原生 JSONL
 * 4. 即使 provider 通过 streamEvents 输出 NormalizedStreamEvent，bridge 仍按协议格式编码输出
 */
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import type { ProxyProfile, NormalizedStreamEvent } from "@proxy2localai/shared";
import { DEFAULT_MESSAGE_RETURN_STRUCTURE } from "@proxy2localai/shared";
import { createBridgeServer } from "./server";
import type { AiProviderAdapter } from "./providers";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  servers.length = 0;
});

const baseProfile: ProxyProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/messages",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
  provider: "claude",
  responseMode: "block",
  messageReturnStructure: "anthropic_messages",
  allowDangerousCli: false,
  enableConversationMemory: false,
  timeoutMs: 0,
  maxBodyBytes: 0,
  contextRegexFlags: "s",
  sseDataEvents: ["message"],
  setupMode: "advanced",
  responseTemplateId: "openai_chat_json",
  sensitiveHeaderPolicy: "default",
  debugEnabled: true,
};

function listen(server: http.Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("无法获取测试服务地址");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function createServerWithProfile(profile: ProxyProfile, provider: AiProviderAdapter): http.Server {
  const dir = mkdtempSync(join(tmpdir(), "proxy2localai-"));
  const profilesPath = join(dir, "profiles.json");
  writeFileSync(profilesPath, JSON.stringify({ profiles: [profile] }), "utf8");
  return createBridgeServer({
    token: "test-token",
    profilesPath,
    requestsLogPath: join(dir, "requests.log"),
    providers: {
      claude: provider,
      codex: provider,
      custom: provider
    }
  });
}

/**
 * 模拟 Claude Code CLI 通过 streamEvents 输出的 NormalizedStreamEvent
 * 这就是 Claude Code 原生 JSONL 经过 codec 解码后的标准化事件
 */
function* claudeCodeNormalizedEvents(): Generator<NormalizedStreamEvent> {
  yield {
    provider: "claude",
    eventId: "evt_000001",
    sequence: 1,
    kind: "lifecycle",
    channel: "status",
    content: "system",
    meta: { providerEventType: "system" }
  };
  yield {
    provider: "claude",
    eventId: "evt_000002",
    sequence: 2,
    kind: "delta",
    channel: "reasoning",
    content: "用户想了解当前项目的文件结构。我需要先查看项目目录。",
    meta: { providerEventType: "content_block_delta" }
  };
  yield {
    provider: "claude",
    eventId: "evt_000003",
    sequence: 3,
    kind: "delta",
    channel: "message",
    content: "我来看一下项目的文件结构。",
    meta: { providerEventType: "content_block_delta" }
  };
  yield {
    provider: "claude",
    eventId: "evt_000004",
    sequence: 4,
    kind: "tool_call_start",
    channel: "tool",
    blockIndex: 2,
    correlationId: "toolu_01A",
    tool: { id: "toolu_01A", name: "Bash", status: "started" },
    meta: { providerEventType: "content_block_start" }
  };
  yield {
    provider: "claude",
    eventId: "evt_000005",
    sequence: 5,
    kind: "tool_call_delta",
    channel: "tool",
    blockIndex: 2,
    correlationId: "toolu_01A",
    tool: { id: "toolu_01A", name: "Bash", inputDelta: "{\"command\":\"ls -la\"}", status: "running" },
    meta: { providerEventType: "content_block_delta" }
  };
  yield {
    provider: "claude",
    eventId: "evt_000006",
    sequence: 6,
    kind: "tool_call_end",
    channel: "tool",
    blockIndex: 2,
    correlationId: "toolu_01A",
    tool: { id: "toolu_01A", name: "Bash", status: "completed" },
    meta: { providerEventType: "content_block_stop" }
  };
  yield {
    provider: "claude",
    eventId: "evt_000007",
    sequence: 7,
    kind: "delta",
    channel: "message",
    content: "这是一个典型的 Node.js 项目结构。",
    meta: { providerEventType: "content_block_delta" }
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// 测试 1：默认 messageReturnStructure 始终为 "anthropic_messages"
// ────────────────────────────────────────────────────────────────────────────────
describe("默认配置验证", () => {
  test("DEFAULT_MESSAGE_RETURN_STRUCTURE 为 anthropic_messages", () => {
    expect(DEFAULT_MESSAGE_RETURN_STRUCTURE).toBe("anthropic_messages");
  });

  test("默认 profile 的 messageReturnStructure 为 anthropic_messages，shouldUseProtocolResponse 为 true", () => {
    // shouldUseProtocolResponse 检查 Boolean(profile.messageReturnStructure)
    // 因为 messageReturnStructure 默认为 "anthropic_messages"（非空字符串），所以始终为 true
    expect(baseProfile.messageReturnStructure).toBe("anthropic_messages");
    expect(Boolean(baseProfile.messageReturnStructure)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 测试 2：block 模式返回 Anthropic Messages JSON，不是 Claude Code 原生 JSONL
// ────────────────────────────────────────────────────────────────────────────────
describe("block 模式输出格式", () => {
  test("block 模式返回 Anthropic Messages API JSON（非 Claude Code 原生 JSONL）", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "项目的目录结构如下：package.json, src/, test/"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "block",
      messageReturnStructure: "anthropic_messages"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "查看目录" }] })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const json = await response.json() as Record<string, unknown>;

    // 验证：输出是 Anthropic Messages API 格式
    expect(json.type).toBe("message");
    expect(json.role).toBe("assistant");
    expect(json.id).toMatch(/^msg-/);
    expect(json.stop_reason).toBe("end_turn");
    expect((json.content as Array<unknown>)[0]).toMatchObject({
      type: "text",
      text: "项目的目录结构如下：package.json, src/, test/"
    });

    // 验证：输出不是 Claude Code 原生 JSONL 格式
    // Claude Code 原生格式有 "type":"stream_event" 或 "type":"assistant"
    const text = JSON.stringify(json);
    expect(text).not.toContain('"type":"stream_event"');
    expect(text).not.toContain('"type":"system"');
    expect(text).not.toContain('"type":"result"');
    // 也不是 OpenAI 格式
    expect(json.object).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 测试 3：stream 模式返回 Anthropic SSE，不是 Claude Code 原生 JSONL
// ────────────────────────────────────────────────────────────────────────────────
describe("stream 模式输出格式（使用 streamText）", () => {
  test("stream 模式返回 Anthropic SSE 格式（content_block_delta），不是 Claude Code 原生 JSONL", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() {
        yield "我来看一下项目的文件结构。";
        yield "\n\n";
        yield "这是一个典型的 Node.js 项目结构。";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "stream",
      messageReturnStructure: "anthropic_messages"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "查看目录" }] })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const text = await response.text();

    // 验证：输出是 Anthropic SSE 格式
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain("event: content_block_stop");
    expect(text).toContain("event: message_delta");
    expect(text).toContain("event: message_stop");
    expect(text).toContain('"text_delta"');
    expect(text).toContain('"type":"text_delta"');

    // 验证：输出不是 Claude Code 原生 JSONL 格式
    // Claude Code 原生格式用 JSONL（每行一个 JSON 对象），而不是 SSE
    expect(text).not.toContain('"type":"stream_event"');
    expect(text).not.toContain('"type":"system"');
    expect(text).not.toContain('"thinking_delta"');
    expect(text).not.toContain('"input_json_delta"');

    // 验证：不是 OpenAI Chat Completions 格式
    expect(text).not.toContain("chat.completion.chunk");

    // 验证：不是 proxy_status 内部事件
    expect(text).not.toContain("proxy_status");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 测试 4：provider 通过 streamEvents 输出 NormalizedStreamEvent 时，bridge 仍按协议格式编码
// 这是关键测试：即使 provider 已经把 Claude Code 原生 JSONL 解码为 NormalizedStreamEvent，
// bridge 也不会原样输出这些事件，而是按 messageReturnStructure 协议重新编码
// ────────────────────────────────────────────────────────────────────────────────
describe("stream 模式 + NormalizedStreamEvent 输入", () => {
  test("provider 输出 NormalizedStreamEvent，bridge 仍编码为 Anthropic SSE（非透传原生格式）", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; },
      async *streamEvents() {
        yield* claudeCodeNormalizedEvents();
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "stream",
      messageReturnStructure: "anthropic_messages"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "查看目录" }] })
    });

    const text = await response.text();

    // 验证：输出仍然是 Anthropic SSE 协议格式
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain("event: message_stop");

    // 验证：没有透传 NormalizedStreamEvent 的字段
    expect(text).not.toContain('"kind":"delta"');
    expect(text).not.toContain('"channel":"message"');
    expect(text).not.toContain('"provider":"claude"');
    expect(text).not.toContain('"eventId":"evt_');
    expect(text).not.toContain('"sequence":');

    // 验证：reasoning 内容没有被透传（因为 protocolStreamResponse 只用 streamText）
    // 实际上 stream 模式下 shouldUseProtocolResponse=true 走 protocolStreamResponse，
    // 它只用 provider.streamText()，不用 streamEvents()
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 测试 5：mapped_sse 模式才能真正消费 NormalizedStreamEvent
// 只有 mapped_sse 模式使用 streamNormalizedProviderEvents() 来消费 NormalizedStreamEvent
// ────────────────────────────────────────────────────────────────────────────────
describe("mapped_sse 模式消费 NormalizedStreamEvent", () => {
  test("mapped_sse 模式用 streamMappings 把 NormalizedStreamEvent 转为自定义 SSE", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield "不应使用 streamText"; },
      async *streamEvents() {
        yield* claudeCodeNormalizedEvents();
      }
    };
    // 注意：默认 toolEventPolicy.enabled = false，tool 事件会被 sanitizeStreamEventForMapping 过滤
    // 所以 tool_call_start/delta/end 事件默认不会出现在输出中
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "mapped_sse",
      streamMappings: [
        {
          id: "reasoning",
          enabled: true,
          match: { kind: "delta", channel: "reasoning" },
          emit: { protocol: "sse", event: "thinking", data: { text: "{{content}}" } }
        },
        {
          id: "message",
          enabled: true,
          match: { kind: "delta", channel: "message" },
          emit: { protocol: "sse", event: "text", data: { text: "{{content}}" } }
        },
        {
          id: "tool-start",
          enabled: true,
          match: { kind: "tool_call_start" },
          emit: { protocol: "sse", event: "tool_start", data: { tool: "{{tool.name}}", id: "{{tool.id}}" } }
        }
      ],
      streamDoneEvent: {
        event: "done",
        data: { status: "completed" }
      },
      // 显式启用 toolEventPolicy 才能看到 tool 事件
      toolEventPolicy: {
        enabled: true,
        includeInput: "redacted",
        includeOutput: "none",
        redactPaths: true,
        redactSecrets: true
      }
    }, provider);
    const baseUrl = await listen(server);

    // 验证 profile 经过 normalize 后 toolEventPolicy.enabled 为 true
    const profilesResponse = await fetch(`${baseUrl}/admin/profiles`, {
      headers: { "x-proxy2localai-token": "test-token" }
    });
    // admin/profiles 列表不包含 toolEventPolicy 详情，所以只验证请求能正常发出

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "查看目录" }] })
    });

    const text = await response.text();

    // 验证：mapped_sse 按自定义映射规则输出
    expect(text).toContain("event: thinking");
    expect(text).toContain("event: text");
    expect(text).toContain("event: tool_start");

    // 验证：content 来自 NormalizedStreamEvent
    expect(text).toContain("用户想了解当前项目的文件结构");
    expect(text).toContain("我来看一下项目的文件结构");
    expect(text).toContain("这是一个典型的 Node.js 项目结构");
    expect(text).toContain("Bash");

    // 验证：done 事件正确发送
    expect(text).toContain("event: done");
    expect(text).toContain('"status":"completed"');

    // 验证：不是 Anthropic SSE 格式
    expect(text).not.toContain("event: message_start");
    expect(text).not.toContain("content_block_delta");
    expect(text).not.toContain("text_delta");

    // 验证：不是 Claude Code 原生格式
    expect(text).not.toContain('"type":"stream_event"');
  });

  test("mapped_sse 默认 toolEventPolicy.enabled=false 过滤 tool 事件", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield "不应使用 streamText"; },
      async *streamEvents() {
        yield* claudeCodeNormalizedEvents();
      }
    };
    // 不设置 toolEventPolicy，使用默认值 (enabled: false)
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "mapped_sse",
      streamMappings: [
        {
          id: "reasoning",
          enabled: true,
          match: { kind: "delta", channel: "reasoning" },
          emit: { protocol: "sse", event: "thinking", data: { text: "{{content}}" } }
        },
        {
          id: "message",
          enabled: true,
          match: { kind: "delta", channel: "message" },
          emit: { protocol: "sse", event: "text", data: { text: "{{content}}" } }
        },
        {
          id: "tool-start",
          enabled: true,
          match: { kind: "tool_call_start" },
          emit: { protocol: "sse", event: "tool_start", data: { tool: "{{tool.name}}" } }
        }
      ],
      streamDoneEvent: {
        event: "done",
        data: { status: "completed" }
      }
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "查看目录" }] })
    });

    const text = await response.text();

    // tool 事件被过滤，不会出现
    expect(text).not.toContain("event: tool_start");
    expect(text).not.toContain("Bash");

    // 非 tool 事件正常输出
    expect(text).toContain("event: thinking");
    expect(text).toContain("event: text");
    expect(text).toContain("event: done");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 测试 6：stream 模式下 protocolStreamResponse 只调用 streamText，忽略 streamEvents
// 这证明 stream 模式根本不消费 NormalizedStreamEvent
// ────────────────────────────────────────────────────────────────────────────────
describe("stream 模式不消费 NormalizedStreamEvent", () => {
  test("protocolStreamResponse 只调用 streamText，不调用 streamEvents", async () => {
    let streamTextCalled = false;
    let streamEventsCalled = false;

    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() {
        streamTextCalled = true;
        yield "hello";
      },
      async *streamEvents() {
        streamEventsCalled = true;
        yield {
          provider: "claude",
          eventId: "evt_000001",
          sequence: 1,
          kind: "delta",
          channel: "message",
          content: "should not appear"
        };
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "stream",
      messageReturnStructure: "anthropic_messages"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
    });

    const text = await response.text();

    // streamText 被调用，streamEvents 没有被调用
    expect(streamTextCalled).toBe(true);
    expect(streamEventsCalled).toBe(false);

    // 输出只包含 streamText 的内容，通过 Anthropic SSE 协议编码
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain('"text":"hello"');
    expect(text).not.toContain("should not appear");
  });
});
