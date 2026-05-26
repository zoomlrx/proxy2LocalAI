import { describe, expect, test } from "vitest";
import type { ProxyProfile } from "@proxy2localai/shared";
import { createDoctorReport } from "./doctor";

const profile: ProxyProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
  provider: "custom",
  responseMode: "block",
  timeoutMs: 0,
  maxBodyBytes: 0,
  customCommand: "node",
  sseDataEvents: ["message"],
  allowDangerousCli: false,
  enableConversationMemory: false,
  contextRegexFlags: "s",
  setupMode: "advanced",
  responseTemplateId: "openai_chat_json",
  sensitiveHeaderPolicy: "default",
  debugEnabled: true,
};

describe("Bridge 自检报告", () => {
  test("没有配置时返回 warning 但不是 error", () => {
    const report = createDoctorReport({
      port: 39399,
      tokenSource: "test",
      profilesPath: "C:/tmp/profiles.json",
      requestsLogPath: "C:/tmp/requests.log",
      profiles: [],
      canWriteDataPath: () => true,
      now: () => new Date("2026-05-22T00:00:00.000Z")
    });

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.id === "profiles")?.status).toBe("warning");
  });

  test("使用默认本地 token 时给出安全提醒", () => {
    const report = createDoctorReport({
      port: 39399,
      tokenSource: "default local token",
      profilesPath: "C:/tmp/profiles.json",
      requestsLogPath: "C:/tmp/requests.log",
      profiles: [],
      canWriteDataPath: () => true
    });

    expect(report.checks.find((check) => check.id === "token")?.status).toBe("warning");
  });

  test("启用的 custom provider 命令不可用时返回 error", () => {
    const report = createDoctorReport({
      port: 39399,
      tokenSource: "test",
      profilesPath: "C:/tmp/profiles.json",
      requestsLogPath: "C:/tmp/requests.log",
      profiles: [profile],
      canWriteDataPath: () => true,
      commandExists: () => ({ ok: false, message: "not found" })
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === "provider:node")?.status).toBe("error");
  });
});
