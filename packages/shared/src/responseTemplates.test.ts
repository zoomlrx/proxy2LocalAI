import { describe, expect, test } from "vitest";
import { getBuiltinResponseTemplate, applyResponseTemplateToProfile, BUILTIN_RESPONSE_TEMPLATES, inferResponseTemplateFromSample } from "./responseTemplates";
import type { ProxyProfile } from "./profile";

const baseProfile: ProxyProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project",
  provider: "claude",
  responseMode: "stream",
  allowDangerousCli: false,
  enableConversationMemory: false,
  timeoutMs: 0,
  maxBodyBytes: 0,
  contextRegexFlags: "s",
  sseDataEvents: ["message"],
  setupMode: "advanced",
  responseTemplateId: "openai_sse",
  sensitiveHeaderPolicy: "default",
  debugEnabled: true
};

describe("内置响应模板", () => {
  test("至少有 4 个内置模板", () => {
    expect(BUILTIN_RESPONSE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  test("内置通用 SSE 模板设置 mapped_sse 默认映射", () => {
    const template = getBuiltinResponseTemplate("generic_sse");
    expect(template).toBeDefined();
    const profile = applyResponseTemplateToProfile(baseProfile, template!);

    expect(profile.responseMode).toBe("mapped_sse");
    expect(profile.responseTemplateId).toBe("generic_sse");
    expect(profile.sseEventMappings).toEqual([
      { source: "reasoning", targetEvent: "reasoning" },
      { source: "message", targetEvent: "message" }
    ]);
  });

  test("内置业务 JSON 模板设置 custom_json 模板", () => {
    const template = getBuiltinResponseTemplate("business_code_data_message");
    expect(template).toBeDefined();
    const profile = applyResponseTemplateToProfile(baseProfile, template!);

    expect(profile.responseMode).toBe("custom_json");
    expect(profile.customJsonTemplate).toContain("<aiData/>");
  });

  test("内置 OpenAI Chat JSON 模板设置 block 模式", () => {
    const template = getBuiltinResponseTemplate("openai_chat_json");
    expect(template).toBeDefined();
    expect(template!.responseMode).toBe("block");
  });

  test("内置 OpenAI SSE 模板设置 stream 模式", () => {
    const template = getBuiltinResponseTemplate("openai_sse");
    expect(template).toBeDefined();
    expect(template!.responseMode).toBe("stream");
  });

  test("不存在的模板返回 undefined", () => {
    expect(getBuiltinResponseTemplate("nonexistent")).toBeUndefined();
  });
});

describe("从响应样例推断模板", () => {
  test("从 event:message/event:done SSE 样例推断 mapped_sse 模板", () => {
    const template = inferResponseTemplateFromSample(
      'event:message\ndata:"hi"\n\nevent:done\ndata:{}\n\n'
    );

    expect(template.responseMode).toBe("mapped_sse");
    expect(template.suggestedTemplateId).toBe("generic_sse");
    expect(template.sseEventMappings).toEqual([
      { source: "message", targetEvent: "message" }
    ]);
  });

  test("从包含多个事件的 SSE 样例推断带映射的 mapped_sse 模板", () => {
    const template = inferResponseTemplateFromSample(
      'event:reasoning\ndata:"thinking"\n\nevent:message\ndata:"hello"\n\nevent:done\ndata:{}\n\n'
    );

    expect(template.responseMode).toBe("mapped_sse");
    expect(template.sseEventMappings).toEqual([
      { source: "reasoning", targetEvent: "reasoning" },
      { source: "message", targetEvent: "message" }
    ]);
  });

  test("从 code/data/message JSON 样例推断 custom_json 模板", () => {
    const template = inferResponseTemplateFromSample('{"code":0,"data":"hi","message":"ok"}');

    expect(template.responseMode).toBe("custom_json");
    expect(template.suggestedTemplateId).toBe("business_code_data_message");
    expect(template.customJsonTemplate).toContain("<aiData/>");
  });

  test("从非业务 JSON 推断 block 模式", () => {
    const template = inferResponseTemplateFromSample('{"choices":[{"message":{"content":"hello"}}]}');

    expect(template.responseMode).toBe("block");
    expect(template.suggestedTemplateId).toBe("openai_chat_json");
  });

  test("从纯文本推断 block 模式", () => {
    const template = inferResponseTemplateFromSample("Hello, this is a plain text response.");

    expect(template.responseMode).toBe("block");
    expect(template.suggestedTemplateId).toBe("openai_chat_json");
  });
});
