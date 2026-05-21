import { describe, expect, it } from "vitest";
import type { ProxyProfile } from "@proxy2localai/shared";
import { createDoctorReport } from "./doctor";

function createProfile(overrides: Partial<ProxyProfile> = {}): ProxyProfile {
  return {
    id: "openai-chat",
    name: "OpenAI Chat",
    enabled: true,
    targetOrigin: "https://api.openai.com",
    targetPath: "/v1/chat/completions",
    methods: ["POST"],
    projectDir: "C:/project/demoProject/proxy2LocalAI",
    provider: "claude",
    responseMode: "stream",
    timeoutMs: 0,
    maxBodyBytes: 0,
    sseDataEvents: ["message"],
    ...overrides
  };
}

describe("doctor 自检报告", () => {
  it("当配置、存储和 provider 命令都可用时报告通过", () => {
    const report = createDoctorReport({
      port: 39399,
      tokenSource: "PROXY2LOCALAI_TOKEN",
      profilesPath: "C:/Users/me/AppData/Roaming/Proxy2LocalAI/profiles.json",
      requestsLogPath: "C:/Users/me/AppData/Roaming/Proxy2LocalAI/requests.log",
      profiles: [createProfile()],
      commandExists: (command) => ({ ok: command === "claude", path: `C:/bin/${command}.cmd` }),
      canWriteDataPath: () => true
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      profileCount: 1,
      enabledProfileCount: 1
    });
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ["bridge", "ok"],
      ["profiles", "ok"],
      ["storage", "ok"],
      ["provider:claude", "ok"]
    ]);
  });

  it("当启用配置需要的 provider 命令不存在时报告失败", () => {
    const report = createDoctorReport({
      port: 39399,
      tokenSource: "default local token",
      profilesPath: "C:/data/profiles.json",
      requestsLogPath: "C:/data/requests.log",
      profiles: [createProfile()],
      commandExists: () => ({ ok: false }),
      canWriteDataPath: () => true
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "provider:claude",
      status: "error"
    }));
  });

  it("没有配置时给出 warning 而不是把 bridge 判死", () => {
    const report = createDoctorReport({
      port: 39399,
      tokenSource: "default local token",
      profilesPath: "C:/data/profiles.json",
      requestsLogPath: "C:/data/requests.log",
      profiles: [],
      commandExists: () => ({ ok: false }),
      canWriteDataPath: () => true
    });

    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "profiles",
      status: "warning"
    }));
  });
});
