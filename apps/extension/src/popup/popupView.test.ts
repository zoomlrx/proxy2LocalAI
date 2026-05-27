import { describe, expect, test } from "vitest";
import type { AppConfig, RequestDiagnosticSummary } from "@proxy2localai/shared";
import { buildPopupViewModel } from "./popupView";

function profile(id: string, enabled: boolean) {
  return {
    id,
    name: `Profile ${id}`,
    enabled,
    targetOrigin: "https://api.example.com",
    targetPath: `/${id}`,
    methods: ["POST" as const],
    projectDir: "",
    provider: "claude" as const,
    responseMode: "stream" as const,
    messageReturnStructure: "anthropic_messages" as const,
    allowDangerousCli: false,
    enableConversationMemory: false,
    timeoutMs: 0,
    maxBodyBytes: 0,
    contextRegexFlags: "s",
    sseDataEvents: ["message"],
    setupMode: "advanced" as const,
    responseTemplateId: "openai_sse",
    sensitiveHeaderPolicy: "default" as const,
    debugEnabled: true
  };
}

const config: AppConfig = {
  bridgeBaseUrl: "http://127.0.0.1:39399",
  token: "local-token",
  profiles: [profile("a", true), profile("b", false), profile("c", true), profile("d", true), profile("e", false)]
};

const diagnostics: RequestDiagnosticSummary[] = [
  { id: "ok", method: "POST", targetUrl: "https://api.example.com/a", profileId: "a", startedAt: "2026-05-25T01:00:00.000Z", finalStatus: "ok" },
  { id: "fail", method: "POST", targetUrl: "https://api.example.com/b", profileId: "b", startedAt: "2026-05-25T01:01:00.000Z", finalStatus: "error", errorStage: "provider_error" }
];

describe("Popup 轻量控制台视图模型", () => {
  test("截断 Profile、统计启用数并展示最近失败", () => {
    const view = buildPopupViewModel(config, { ok: true, version: "0.1.0" }, diagnostics);

    expect(view.bridgeState).toBe("online");
    expect(view.profileCount).toBe(5);
    expect(view.enabledProfileCount).toBe(3);
    expect(view.visibleProfiles).toHaveLength(4);
    expect(view.hasMoreProfiles).toBe(true);
    expect(view.visibleProfiles[0]?.switchLabel).toBe("停用 Profile a");
    expect(view.visibleProfiles[1]?.switchLabel).toBe("启用 Profile b");
    expect(view.recentFailure?.stageLabel).toBe("Provider 执行错误");
  });

  test("Bridge health 缺失时展示离线状态", () => {
    const view = buildPopupViewModel(config, null, []);

    expect(view.bridgeState).toBe("offline");
    expect(view.bridgeLabel).toBe("Bridge 未连接");
  });
});
