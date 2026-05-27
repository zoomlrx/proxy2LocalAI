import { describe, expect, test } from "vitest";
import {
  DEFAULT_MAPPING_SECURITY_POLICY,
  DEFAULT_TOOL_EVENT_POLICY,
  type ProxyProfile,
  type RequestDiagnosticSummary
} from "@proxy2localai/shared";
import { buildProfileInspectorView } from "./profileWorkspaceView";

const profile: ProxyProfile = {
  id: "profile-mpc2v6nc",
  name: "智能问答",
  enabled: true,
  targetOrigin: "https://qiqiao-tcb-qa.qiweioa.com.cn",
  targetPath: "/qiqiao2/console/api/v1/bpms-workflow",
  methods: ["POST"],
  projectDir: "C:\\project\\demoProject\\testVs",
  provider: "claude",
  responseMode: "mapped_sse",
  messageReturnStructure: "anthropic_messages",
  allowDangerousCli: false,
  enableConversationMemory: false,
  timeoutMs: 0,
  maxBodyBytes: 0,
  contextRegexFlags: "s",
  sseDataEvents: ["message"],
  setupMode: "advanced",
  responseTemplateId: "generic_sse",
  sensitiveHeaderPolicy: "default",
  debugEnabled: true
};

describe("Profile 工作区视图模型", () => {
  test("未选择规则时给出空摘要和创建引导", () => {
    const view = buildProfileInspectorView(null);

    expect(view.hasSelection).toBe(false);
    expect(view.title).toBe("所选规则");
    expect(view.subtitle).toBe("尚未选择 Profile");
    expect(view.statusLabel).toBe("未启用");
    expect(view.editLabel).toBe("新建代理");
    expect(view.summary).toEqual([]);
  });

  test("已选择规则时生成抽屉标题和摘要字段", () => {
    const view = buildProfileInspectorView(profile);

    expect(view.hasSelection).toBe(true);
    expect(view.title).toBe("智能问答");
    expect(view.subtitle).toBe("profile-mpc2v6nc");
    expect(view.statusLabel).toBe("启用");
    expect(view.editLabel).toBe("打开详情");
    expect(view.drawerTitle).toBe("编辑规则：智能问答");
    expect(view.summary).toEqual([
      { label: "名称", value: "智能问答" },
      { label: "Provider", value: "claude" },
      { label: "响应协议", value: "mapped_sse" },
      { label: "项目路径", value: "C:\\project\\demoProject\\testVs", copyable: true }
    ]);
  });

  test("侧栏视图模型生成映射、安全和诊断摘要", () => {
    const diagnostics: RequestDiagnosticSummary[] = [
      { id: "r1", method: "POST", targetUrl: "https://example.com/a", profileId: profile.id, startedAt: "2026-05-27T10:00:00.000Z", finalStatus: "ok", duration: 80 },
      { id: "r2", method: "POST", targetUrl: "https://example.com/a", profileId: profile.id, startedAt: "2026-05-27T10:01:00.000Z", finalStatus: "error", errorStage: "provider_timeout", duration: 1200 }
    ];
    const view = buildProfileInspectorView({
      ...profile,
      streamMappings: [
        { id: "message", enabled: true, match: { channel: "message" }, emit: { protocol: "sse", event: "message", data: "{{content}}" } },
        { id: "reasoning", enabled: false, match: { channel: "reasoning" }, emit: { protocol: "sse", event: "reasoning", data: "{{content}}" } }
      ],
      mappingSecurityPolicy: {
        ...DEFAULT_MAPPING_SECURITY_POLICY,
        allowRaw: true
      },
      toolEventPolicy: {
        ...DEFAULT_TOOL_EVENT_POLICY,
        enabled: true,
        includeInput: "raw"
      }
    }, diagnostics);

    expect(view.mappingStatus).toEqual([
      { label: "规则数", value: "2", tone: "default" },
      { label: "已启用", value: "1", tone: "success" },
      { label: "预览状态", value: "正常", tone: "success" }
    ]);
    expect(view.securitySwitches.find((item) => item.id === "allowRaw")?.checked).toBe(true);
    expect(view.securitySwitches.find((item) => item.id === "toolEvents")?.checked).toBe(true);
    expect(view.securitySwitches.find((item) => item.id === "toolIo")?.checked).toBe(true);
    expect(view.hasHighRiskEnabled).toBe(true);
    expect(view.diagnostics.latestRequestLabel).toBe("失败 · 1.2s");
    expect(view.diagnostics.latestFailureLabel).toBe("Provider 超时");
  });
});
