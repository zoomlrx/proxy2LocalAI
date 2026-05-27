import { describe, expect, test } from "vitest";
import type { AppConfig, RequestDiagnosticSummary } from "@proxy2localai/shared";
import {
  buildDashboardStatus,
  buildProxyChainSteps,
  getDiagnosticStageLabel,
  getFailedRequestCount,
  formatDurationForDisplay
} from "./dashboardView";

const config: AppConfig = {
  bridgeBaseUrl: "http://127.0.0.1:39399",
  token: "local-token",
  profiles: [
    { id: "p1", name: "Chat", enabled: true, targetOrigin: "https://a.example", targetPath: "/chat", methods: ["POST"], projectDir: "", provider: "claude", responseMode: "stream", messageReturnStructure: "anthropic_messages", allowDangerousCli: false, enableConversationMemory: false, timeoutMs: 0, maxBodyBytes: 0, contextRegexFlags: "s", sseDataEvents: ["message"], setupMode: "wizard", responseTemplateId: "openai_sse", sensitiveHeaderPolicy: "default", debugEnabled: true },
    { id: "p2", name: "Code", enabled: false, targetOrigin: "https://b.example", targetPath: "/code", methods: ["POST"], projectDir: "", provider: "codex", responseMode: "block", messageReturnStructure: "anthropic_messages", allowDangerousCli: false, enableConversationMemory: false, timeoutMs: 0, maxBodyBytes: 0, contextRegexFlags: "s", sseDataEvents: ["message"], setupMode: "advanced", responseTemplateId: "openai_chat_json", sensitiveHeaderPolicy: "default", debugEnabled: true },
    { id: "p3", name: "Map", enabled: true, targetOrigin: "https://c.example", targetPath: "/map", methods: ["POST"], projectDir: "", provider: "claude", responseMode: "mapped_sse", messageReturnStructure: "anthropic_messages", allowDangerousCli: false, enableConversationMemory: false, timeoutMs: 0, maxBodyBytes: 0, contextRegexFlags: "s", sseDataEvents: ["message"], setupMode: "advanced", responseTemplateId: "generic_sse", sensitiveHeaderPolicy: "default", debugEnabled: true }
  ]
};

const diagnostics: RequestDiagnosticSummary[] = [
  { id: "r1", method: "POST", targetUrl: "https://a.example/chat", profileId: "p1", startedAt: "2026-05-25T01:00:00.000Z", finalStatus: "ok", duration: 240 },
  { id: "r2", method: "POST", targetUrl: "https://a.example/chat", profileId: "p1", startedAt: "2026-05-25T01:01:00.000Z", finalStatus: "error", errorStage: "provider_timeout", duration: 1200 },
  { id: "r3", method: "POST", targetUrl: "https://x.example/chat", startedAt: "2026-05-25T01:02:00.000Z", finalStatus: "error", errorStage: "profile_matched" }
];

describe("Options 控制台视图模型", () => {
  test("汇总 Bridge、Profile 和最近失败请求状态", () => {
    const status = buildDashboardStatus(config, { ok: true, version: "0.1.0", protocolVersion: 1 }, diagnostics);

    expect(status.bridgeState).toBe("online");
    expect(status.bridgeLabel).toBe("Bridge 在线");
    expect(status.profileCount).toBe(3);
    expect(status.enabledProfileCount).toBe(2);
    expect(status.failedRequestCount).toBe(2);
  });

  test("Bridge 未连接时展示离线状态", () => {
    const status = buildDashboardStatus(config, null, []);

    expect(status.bridgeState).toBe("offline");
    expect(status.bridgeLabel).toBe("Bridge 离线");
  });

  test("诊断格式化辅助函数稳定输出", () => {
    expect(getFailedRequestCount(diagnostics)).toBe(2);
    expect(formatDurationForDisplay(999)).toBe("999ms");
    expect(formatDurationForDisplay(1200)).toBe("1.2s");
    expect(formatDurationForDisplay()).toBe("-");
    expect(getDiagnosticStageLabel("provider_timeout")).toBe("Provider 超时");
  });

  test("根据最近失败阶段生成可读的代理链路阶段条", () => {
    const steps = buildProxyChainSteps({ ok: true }, diagnostics);

    expect(steps.map((step) => step.id)).toEqual([
      "dnr",
      "bridge",
      "profile",
      "provider",
      "response",
      "client"
    ]);
    expect(steps.find((step) => step.id === "provider")?.state).toBe("warning");
    expect(steps.find((step) => step.id === "provider")?.detail).toBe("Provider 超时");
    expect(steps.find((step) => step.id === "response")?.state).toBe("pending");
  });

});
