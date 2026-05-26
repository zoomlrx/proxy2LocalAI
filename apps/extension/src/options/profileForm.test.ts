import { describe, expect, test } from "vitest";
import type { AppConfig, ProxyProfile } from "@proxy2localai/shared";
import {
  applyResponseModeToDraft,
  applyTemplateToDraft,
  createBlankProfile,
  createWizardProfileFromCurl,
  draftToProfile,
  getDefaultExpandedSections,
  getRecommendedTemplateCards,
  getRecommendedTemplateId,
  profileToDraft,
  summarizeCurlCommand,
  upsertProfile
} from "./profileForm";

const baseProfile: ProxyProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
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
  debugEnabled: true,
};

describe("profile 表单配置合并", () => {
  test("更新已有 profile 时保留最高权限和 provider 参数", () => {
    const config: AppConfig = {
      bridgeBaseUrl: "http://127.0.0.1:39399",
      token: "local-token",
      profiles: [baseProfile]
    };

    const next = upsertProfile(config, {
      ...baseProfile,
      allowDangerousCli: true,
      providerArgs: ["--dangerously-skip-permissions"]
    });

    expect(next.profiles).toHaveLength(1);
    expect(next.profiles[0]?.allowDangerousCli).toBe(true);
    expect(next.profiles[0]?.providerArgs).toEqual(["--dangerously-skip-permissions"]);
  });

  test("保存 mapped_sse 配置时把事件映射和 done 事件转成结构化配置", () => {
    const draft = profileToDraft({
      ...baseProfile,
      responseMode: "mapped_sse"
    });

    const profile = draftToProfile({
      ...draft,
      sseEventMappings: "reasoning=reasoning\nmessage=message",
      sseDoneEvent: "{\"conversationId\":\"\",\"status\":\"completed\"}"
    });

    expect(profile.sseEventMappings).toEqual([
      { source: "reasoning", targetEvent: "reasoning" },
      { source: "message", targetEvent: "message" }
    ]);
    expect(profile.sseDoneEvent).toEqual({
      targetEvent: "done",
      data: {
        conversationId: "",
        status: "completed"
      }
    });
  });

  test("基础模式默认只展开基础配置", () => {
    expect(getDefaultExpandedSections("wizard")).toEqual(["basic"]);
    expect(getDefaultExpandedSections("advanced")).toEqual(["basic"]);
  });

  test("向导从 cURL 创建默认 OpenAI SSE 代理配置", () => {
    const draft = createWizardProfileFromCurl(
      "curl 'https://api.example.com/v1/chat/completions' --json '{\"messages\":[]}'",
      "C:/project/demoProject/proxy2LocalAI"
    );

    expect(draft.setupMode).toBe("wizard");
    expect(draft.provider).toBe("claude");
    expect(draft.responseMode).toBe("stream");
    expect(draft.responseTemplateId).toBe("openai_sse");
    expect(draft.projectDir).toBe("C:/project/demoProject/proxy2LocalAI");
  });

  test("cURL 摘要展示域名、路径、方法、请求体摘要和流式推断", () => {
    const summary = summarizeCurlCommand(
      "curl 'https://api.example.com/v1/chat/completions?debug=1' --json '{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":true}'"
    );

    expect(summary.origin).toBe("https://api.example.com");
    expect(summary.path).toBe("/v1/chat/completions");
    expect(summary.method).toBe("POST");
    expect(summary.bodySummary).toContain("messages");
    expect(summary.stream).toBe(true);
  });
});

describe("applyTemplateToDraft", () => {
  test("选择通用 SSE 模板时更新返回类型和映射字段", () => {
    const draft = createBlankProfile();
    const next = applyTemplateToDraft(draft, "generic_sse");

    expect(next.responseTemplateId).toBe("generic_sse");
    expect(next.responseMode).toBe("mapped_sse");
    expect(next.sseEventMappings).toContain("reasoning=reasoning");
    expect(next.sseEventMappings).toContain("message=message");
  });

  test("选择业务 JSON 模板时更新返回类型和模板字段", () => {
    const draft = createBlankProfile();
    const next = applyTemplateToDraft(draft, "business_code_data_message");

    expect(next.responseTemplateId).toBe("business_code_data_message");
    expect(next.responseMode).toBe("custom_json");
    expect(next.customJsonTemplate).toContain("<aiData/>");
  });

  test("选择不存在的模板时不改变 draft", () => {
    const draft = createBlankProfile();
    const next = applyTemplateToDraft(draft, "nonexistent");
    expect(next).toEqual(draft);
  });

  test("根据返回类型推荐默认模板", () => {
    expect(getRecommendedTemplateId("stream")).toBe("openai_sse");
    expect(getRecommendedTemplateId("block")).toBe("openai_chat_json");
    expect(getRecommendedTemplateId("mapped_sse")).toBe("generic_sse");
    expect(getRecommendedTemplateId("custom_json")).toBe("business_code_data_message");
  });

  test("切换返回类型时同步推荐模板", () => {
    const draft = createBlankProfile();
    const next = applyResponseModeToDraft(draft, "mapped_sse");

    expect(next.responseMode).toBe("mapped_sse");
    expect(next.responseTemplateId).toBe("generic_sse");
    expect(next.sseEventMappings).toContain("reasoning=reasoning");
  });

  test("模板选择器只展示基础流程推荐的四个模板并标出推荐项", () => {
    const cards = getRecommendedTemplateCards("mapped_sse");

    expect(cards.map((card) => card.id)).toEqual([
      "openai_sse",
      "openai_chat_json",
      "business_code_data_message",
      "generic_sse"
    ]);
    expect(cards.find((card) => card.id === "generic_sse")?.recommended).toBe(true);
    expect(cards.find((card) => card.id === "generic_sse")?.recommendReason).toContain("映射 SSE");
  });
});
