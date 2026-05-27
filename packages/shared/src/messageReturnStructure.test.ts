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

describe("消息返回结构", () => {
  test("旧配置导入时默认使用 Anthropic Messages 原生结构", () => {
    const profile = normalizeProfile(baseProfile);

    expect(profile.messageReturnStructure).toBe("anthropic_messages");
  });

  test("支持保存非原生结构但不改变当前响应协议", () => {
    const profile = normalizeProfile({
      ...baseProfile,
      responseMode: "mapped_sse",
      messageReturnStructure: "openai_responses"
    });

    expect(profile.messageReturnStructure).toBe("openai_responses");
    expect(profile.responseMode).toBe("mapped_sse");
  });

  test("拒绝未知消息返回结构", () => {
    expect(() => normalizeProfile({
      ...baseProfile,
      messageReturnStructure: "api_format"
    })).toThrow("messageReturnStructure");
  });
});
