import { describe, expect, test } from "vitest";
import type { ProxyProfile } from "@proxy2localai/shared";
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
      { label: "命中条件", value: "POST /qiqiao2/console/api/v1/bpms-workflow" },
      { label: "Provider", value: "claude" },
      { label: "响应协议", value: "mapped_sse" },
      { label: "项目路径", value: "C:\\project\\demoProject\\testVs" }
    ]);
  });
});
