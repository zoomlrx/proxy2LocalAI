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
