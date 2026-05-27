import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import type { ProxyProfile } from "@proxy2localai/shared";
import { createBridgeServer } from "./server";
import type { AiProviderAdapter } from "./providers";

const servers: http.Server[] = [];

const baseProfile: ProxyProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
  provider: "custom",
  responseMode: "block",
  messageReturnStructure: "anthropic_messages",
  allowDangerousCli: false,
  enableConversationMemory: false,
  timeoutMs: 0,
  maxBodyBytes: 0,
  contextRegexFlags: "s",
  customCommand: "node",
  sseDataEvents: ["message"],
  setupMode: "advanced",
  responseTemplateId: "openai_chat_json",
  sensitiveHeaderPolicy: "default",
  debugEnabled: true,
};

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  servers.length = 0;
});

describe("Bridge streamMappings renderer", () => {
  test("mapped_sse 使用 streamMappings 渲染标准事件并补齐 done 事件", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "";
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "should not use streamText";
      },
      async *streamEvents() {
        yield {
          provider: "claude",
          eventId: "evt_000001",
          sequence: 1,
          kind: "delta",
          channel: "reasoning",
          content: "分析"
        };
        yield {
          provider: "claude",
          eventId: "evt_000002",
          sequence: 2,
          kind: "raw",
          channel: "debug",
          content: "内部状态"
        };
        yield {
          provider: "claude",
          eventId: "evt_000003",
          sequence: 3,
          kind: "delta",
          channel: "message",
          content: "你好"
        };
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "mapped_sse",
      streamMappings: [
        {
          id: "reasoning",
          enabled: true,
          match: { kind: "delta", channel: "reasoning" },
          emit: { protocol: "sse", event: "reasoning", data: { delta: "{{content}}" } }
        },
        {
          id: "message",
          enabled: true,
          match: { kind: "delta", channel: "message" },
          emit: { protocol: "sse", event: "message", data: { delta: "{{content}}" } }
        }
      ],
      streamDoneEvent: {
        event: "finish",
        data: { status: "completed" }
      }
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ message: "test" })
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain('event: reasoning\ndata: {"delta":"分析"}');
    expect(text).toContain('event: message\ndata: {"delta":"你好"}');
    expect(text).toContain('event: finish\ndata: {"status":"completed"}');
    expect(text).not.toContain("内部状态");
    expect(text).not.toContain("proxy_status");
    expect(text).not.toContain("chat.completion.chunk");
  });

  test("legacy id 的 streamMappings 只要新字段被编辑，也应使用 V2 renderer", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield "不应使用普通 streamText"; },
      async *streamEvents() {
        yield {
          provider: "claude",
          eventId: "evt_000001",
          sequence: 1,
          kind: "delta",
          channel: "message",
          content: "你好"
        };
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "mapped_sse",
      sseEventMappings: [
        { source: "message", targetEvent: "message" }
      ],
      sseDoneEvent: {
        targetEvent: "done",
        data: { status: "completed" }
      },
      streamMappings: [
        {
          id: "legacy-message",
          enabled: true,
          match: { kind: "delta", channel: "message" },
          emit: {
            protocol: "sse",
            event: "message",
            data: { delta: "{{content}}", via: "v2" }
          }
        }
      ],
      streamDoneEvent: {
        event: "finish",
        data: { status: "completed", via: "v2" }
      }
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "test" })
    });

    const text = await response.text();
    expect(text).toContain('event: message\ndata: {"delta":"你好","via":"v2"}');
    expect(text).toContain('event: finish\ndata: {"status":"completed","via":"v2"}');
    expect(text).not.toContain('event:done');
  });
});

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

describe("Bridge 消息返回结构路由", () => {
  test("OpenAI Chat Completions 请求会归一为 messages 并返回 chat.completion", async () => {
    let capturedPrompt = "";
    const provider: AiProviderAdapter = {
      async generateText(_profile, prompt) {
        capturedPrompt = prompt;
        return "本地回答";
      },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      messageReturnStructure: "openai_chat_completions",
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "回答中文" },
          { role: "user", content: [{ type: "text", text: "你好" }] }
        ]
      })
    });

    const json = await response.json() as Record<string, unknown>;
    expect(capturedPrompt).toContain('"protocol": "openai_chat_completions"');
    expect(capturedPrompt).toContain('"content": "你好"');
    expect(json.object).toBe("chat.completion");
    expect(JSON.stringify(json)).toContain("本地回答");
  });

  test("Anthropic Messages 结构返回原生 message 对象而不是 OpenAI Chat JSON", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "Anthropic 回答"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      targetPath: "/v1/messages",
      messageReturnStructure: "anthropic_messages",
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "你好" }]
      })
    });

    const json = await response.json() as Record<string, unknown>;
    expect(json.type).toBe("message");
    expect(json.role).toBe("assistant");
    expect(JSON.stringify(json)).toContain("Anthropic 回答");
    expect(json.object).toBeUndefined();
  });

  test("路由转换后的 prompt 仍保留原始请求体，避免丢失 tools/tool_choice/metadata", async () => {
    let capturedPrompt = "";
    const provider: AiProviderAdapter = {
      async generateText(_profile, prompt) {
        capturedPrompt = prompt;
        return "ok";
      },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      targetPath: "/v1/messages",
      messageReturnStructure: "anthropic_messages",
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        max_tokens: 1024,
        tool_choice: { type: "tool", name: "search" },
        tools: [{ name: "search", input_schema: { type: "object" } }],
        metadata: { traceId: "trace-1" },
        messages: [{ role: "user", content: "你好" }]
      })
    });

    expect(capturedPrompt).toContain('"protocol": "anthropic_messages"');
    expect(capturedPrompt).toContain('"messages"');
    expect(capturedPrompt).toContain('"originalBody"');
    expect(capturedPrompt).toContain('"tool_choice"');
    expect(capturedPrompt).toContain('"max_tokens"');
    expect(capturedPrompt).toContain('"traceId": "trace-1"');
  });

  test("OpenAI Responses 请求会返回 response 对象和 output_text", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "Responses 回答"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      targetPath: "/v1/responses",
      messageReturnStructure: "openai_responses",
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5",
        instructions: "简洁",
        input: [{ role: "user", content: [{ type: "input_text", text: "解释" }] }]
      })
    });

    const json = await response.json() as Record<string, unknown>;
    expect(json.object).toBe("response");
    expect(json.output_text).toBe("Responses 回答");
    expect(JSON.stringify(json)).toContain("\"type\":\"output_text\"");
  });

  test("Gemini generateContent 请求会返回 candidates content parts", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "Gemini 回答"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      targetPath: "/v1beta/models/gemini-2.5-flash:generateContent",
      messageReturnStructure: "gemini_generate_content",
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "介绍" }] }]
      })
    });

    const text = await response.text();
    expect(text).toContain("\"candidates\"");
    expect(text).toContain("\"text\":\"Gemini 回答\"");
    expect(text).toContain("\"modelVersion\":\"local-custom\"");
  });

  test("OpenAI Responses 流式响应不会漏出旧 OpenAI Chat chunk 或 proxy_status", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() {
        yield "你";
        yield "好";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      targetPath: "/v1/responses",
      messageReturnStructure: "openai_responses",
      responseMode: "stream"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "你好", stream: true })
    });

    const text = await response.text();
    expect(text).toContain("event: response.created");
    expect(text).toContain("event: response.output_text.delta");
    expect(text).toContain('"delta":"你"');
    expect(text).toContain("event: response.completed");
    expect(text).not.toContain("chat.completion.chunk");
    expect(text).not.toContain("proxy_status");
  });

  test("Anthropic Messages 流式响应返回 message_start 和 content_block_delta", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() {
        yield "你";
        yield "好";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      targetPath: "/v1/messages",
      messageReturnStructure: "anthropic_messages",
      responseMode: "stream"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "你好" }], stream: true })
    });

    const text = await response.text();
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain('"text":"你"');
    expect(text).toContain("event: message_stop");
    expect(text).not.toContain("chat.completion.chunk");
    expect(text).not.toContain("proxy_status");
  });
});

describe("Bridge 多轮上下文", () => {
  test("开启多轮记忆后第二次请求会带上上一轮问答，并只使用正则提取的上下文", async () => {
    const prompts: string[] = [];
    const provider: AiProviderAdapter = {
      async generateText(_profile, prompt) {
        prompts.push(prompt);
        return `回答 ${prompts.length}`;
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      enableConversationMemory: true,
      contextRegex: "\"message\"\\s*:\\s*\"([^\"]+)\""
    }, provider);
    const baseUrl = await listen(server);

    for (const message of ["第一轮问题", "第二轮问题"]) {
      const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-proxy2localai-page-url": "https://demo.example/chat"
        },
        body: JSON.stringify({ message, noise: "噪音字段" })
      });
      expect(response.ok).toBe(true);
    }

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("<parames>第一轮问题</parames>");
    expect(prompts[0]).not.toContain("噪音字段");
    expect(prompts[0]).not.toContain("<history>");
    expect(prompts[1]).toContain("<history>");
    expect(prompts[1]).toContain("<turn role=\"user\">第一轮问题</turn>");
    expect(prompts[1]).toContain("<turn role=\"assistant\">回答 1</turn>");
    expect(prompts[1]).toContain("<parames>第二轮问题</parames>");
    expect(prompts[1]).not.toContain("噪音字段");
  });
});

describe("Bridge Provider 状态事件", () => {
  test("provider_spawn 状态事件包含实际调用参数，方便确认权限参数已加载", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "";
      },
      async generateRawText() {
        return "";
      },
      async *streamText(_profile, _prompt, context) {
        context?.onEvent?.({
          stage: "provider_spawn",
          provider: "claude",
          command: "claude",
          args: ["-p", "--dangerously-skip-permissions"],
          streaming: true,
          promptChars: 20
        });
        yield "ok";
      }
    };
    const dir = mkdtempSync(join(tmpdir(), "proxy2localai-"));
    const profilesPath = join(dir, "profiles.json");
    const requestsLogPath = join(dir, "requests.log");
    writeFileSync(profilesPath, JSON.stringify({ profiles: [{
      ...baseProfile,
      provider: "claude",
      responseMode: "stream",
      allowDangerousCli: true
    }] }), "utf8");
    const server = createBridgeServer({
      token: "test-token",
      profilesPath,
      requestsLogPath,
      providers: {
        claude: provider,
        codex: provider,
        custom: provider
      }
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ message: "测试" })
    });

    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).not.toContain("\"command\":\"claude\"");
    expect(text).not.toContain("proxy_status");
    const logText = readFileSync(requestsLogPath, "utf8");
    expect(logText).toContain("\"command\":\"claude\"");
    expect(logText).toContain("\"args\":[\"-p\",\"--dangerously-skip-permissions\"]");
  });
});

describe("Bridge 映射 SSE", () => {
  test("只返回已配置映射的 provider 事件，并补齐 done 事件", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "";
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "不应使用普通 streamText";
      },
      async *streamEvents() {
        yield { source: "reasoning", content: "分析" };
        yield { source: "debug", content: "内部状态" };
        yield { source: "message", content: "你好" };
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "mapped_sse",
      sseEventMappings: [
        { source: "reasoning", targetEvent: "reasoning" },
        { source: "message", targetEvent: "message" }
      ],
      sseDoneEvent: {
        targetEvent: "done",
        data: {
          conversationId: "",
          status: "completed",
          completionTokens: 0,
          promptTokens: 0,
          totalTokens: 0
        }
      }
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ message: "测试" })
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event:reasoning\ndata:\"\\\"分析\\\"\"");
    expect(text).toContain("event:message\ndata:\"\\\"你好\\\"\"");
    expect(text).toContain("event:done\ndata:{\"conversationId\":\"\",\"status\":\"completed\",\"completionTokens\":0,\"promptTokens\":0,\"totalTokens\":0}");
    expect(text).not.toContain("内部状态");
    expect(text).not.toContain("proxy_status");
    expect(text).not.toContain("chat.completion.chunk");
  });
});

describe("Bridge 测试代理接口", () => {
  test("POST /admin/test-profile/:profileId 执行一次测试代理并返回阶段摘要", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "测试响应";
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "";
      }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

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
    const result = await response.json();
    expect(result.ok).toBe(true);
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile_matched", status: "ok" }),
        expect.objectContaining({ id: "provider_done", status: "ok" })
      ])
    );
  });

  test("POST /admin/test-profile/:profileId 不存在的 profile 返回 404", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/admin/test-profile/nonexistent`, {
      method: "POST",
      headers: {
        "x-proxy2localai-token": "test-token"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(404);
  });

  test("POST /admin/test-profile/:profileId 未授权返回 401", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/admin/test-profile/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(401);
  });

  test("POST /admin/test-profile/:profileId provider 报错时返回错误阶段", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        throw new Error("模拟 provider 故障");
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "";
      }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

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
    const result = await response.json();
    expect(result.ok).toBe(false);
    expect(result.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "provider_done", status: "error" })
      ])
    );
  });

  test("POST /admin/test-profile-draft 执行草稿测试但不持久化 profile", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "草稿响应";
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "";
      }
    };
    const dir = mkdtempSync(join(tmpdir(), "proxy2localai-"));
    const server = createBridgeServer({
      token: "test-token",
      profilesPath: join(dir, "profiles.json"),
      requestsLogPath: join(dir, "requests.log"),
      providers: {
        claude: provider,
        codex: provider,
        custom: provider
      }
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/admin/test-profile-draft`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-proxy2localai-token": "test-token"
      },
      body: JSON.stringify({
        profile: baseProfile,
        sample: {
          headers: { "content-type": "application/json" },
          body: { messages: [{ role: "user", content: "ping" }] }
        }
      })
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.ok).toBe(true);
    expect(result.preview).toBe("草稿响应");

    const profilesResponse = await fetch(`${baseUrl}/admin/profiles`, {
      headers: { "x-proxy2localai-token": "test-token" }
    });
    const profilesBody = await profilesResponse.json();
    expect(profilesBody.profiles).toEqual([]);
  });
});

describe("Bridge 诊断阶段", () => {
  test("block 模式 proxy 请求在接入诊断后仍正常工作", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "诊断测试响应";
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.type).toBe("message");
    expect(body.content[0].text).toBe("诊断测试响应");
  });

  test("stream 模式 proxy 请求在接入诊断后仍正常工作", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "";
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "流式";
        yield "响应";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "stream"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("流式");
    expect(text).toContain("响应");
  });

  test("custom_json 模式 proxy 请求在接入诊断后仍正常工作", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        return "";
      },
      async generateRawText() {
        return "自定义JSON内容";
      },
      async *streamText() {
        yield "";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "custom_json",
      customJsonTemplate: '{"result":<aiData/>}'
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("自定义JSON内容");
  });

  test("block 模式 provider 抛错时诊断记录错误阶段", async () => {
    const provider: AiProviderAdapter = {
      async generateText() {
        throw new Error("provider 故障模拟");
      },
      async generateRawText() {
        return "";
      },
      async *streamText() {
        yield "";
      }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.type).toBe("provider_error");
  });
});

describe("Bridge Provider 实际检测", () => {
  test("POST /admin/test-provider/:profileId 返回实际输出摘要", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "hello from provider"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/admin/test-provider/chat`, {
      method: "POST",
      headers: { "x-proxy2localai-token": "test-token" }
    });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.output).toBe("hello from provider");
    expect(typeof body.duration).toBe("number");
  });

  test("POST /admin/test-provider/:profileId provider 报错", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { throw new Error("provider 启动失败"); },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/admin/test-provider/chat`, {
      method: "POST",
      headers: { "x-proxy2localai-token": "test-token" }
    });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("provider 启动失败");
  });

  test("POST /admin/test-provider/:profileId 不存在的 profile", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/admin/test-provider/nonexistent`, {
      method: "POST",
      headers: { "x-proxy2localai-token": "test-token" }
    });
    expect(response.status).toBe(404);
  });
});

describe("Bridge 版本信息", () => {
  test("/health 返回 bridge 版本和协议版本", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    expect(body.version).toMatch(/^0\.1\./);
    expect(body.protocolVersion).toBe(1);
  });
});

describe("Bridge 诊断 API", () => {
  test("GET /diagnostics/recent 返回最近请求列表", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "ok"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    // 先发一个 proxy 请求产生诊断数据
    await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    });

    const response = await fetch(`${baseUrl}/diagnostics/recent?token=test-token`);
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].finalStatus).toBe("ok");
  });

  test("GET /diagnostics/recent/:requestId 返回请求详情", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "hello"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "test" })
    });

    const recent = await fetch(`${baseUrl}/diagnostics/recent?token=test-token`);
    const recentBody = await recent.json();
    const requestId = recentBody.items[0]?.id;
    expect(requestId).toBeTruthy();

    const detail = await fetch(`${baseUrl}/diagnostics/recent/${requestId}?token=test-token`);
    expect(detail.ok).toBe(true);
    const detailBody = await detail.json();
    expect(detailBody.summary.id).toBe(requestId);
    expect(detailBody.stages.length).toBeGreaterThan(0);
  });

  test("GET /diagnostics/recent/:requestId/export 返回脱敏文本", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return "response"; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile({
      ...baseProfile,
      responseMode: "block"
    }, provider);
    const baseUrl = await listen(server);

    await fetch(`${baseUrl}/proxy/chat?token=test-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "test" })
    });

    const recent = await fetch(`${baseUrl}/diagnostics/recent?token=test-token`);
    const recentBody = await recent.json();
    const requestId = recentBody.items[0]?.id;

    const exportResponse = await fetch(`${baseUrl}/diagnostics/recent/${requestId}/export?token=test-token`);
    expect(exportResponse.ok).toBe(true);
    expect(exportResponse.headers.get("content-type")).toContain("text/plain");
    const text = await exportResponse.text();
    expect(text).not.toContain("Bearer");
  });

  test("诊断 API 未授权返回 401", async () => {
    const provider: AiProviderAdapter = {
      async generateText() { return ""; },
      async generateRawText() { return ""; },
      async *streamText() { yield ""; }
    };
    const server = createServerWithProfile(baseProfile, provider);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/diagnostics/recent`);
    expect(response.status).toBe(401);
  });
});
