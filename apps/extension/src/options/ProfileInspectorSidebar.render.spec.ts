import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProfileInspectorSidebar } from "./components/ProfileInspectorSidebar";
import { createBlankProfile, type ProfileDraft } from "./profileForm";

function createDraft(): ProfileDraft {
  return {
    ...createBlankProfile(),
    id: "profile-test",
    name: "智能问答",
    targetOrigin: "https://api.example.com",
    targetPath: "/v1/chat/completions",
    methods: ["POST"],
    projectDir: "C:\\project\\demoProject\\testVs\\very\\long\\path",
    provider: "claude",
    responseMode: "mapped_sse"
  };
}

function renderSidebar(draft = createDraft()) {
  return renderToStaticMarkup(
    React.createElement(ProfileInspectorSidebar, {
      draft,
      selectedProfile: { id: draft.id },
      onCreate: () => undefined,
      onChangeDraft: () => undefined,
      onOpenPathDialog: () => undefined,
      onOpenConfig: () => undefined,
      onSave: () => undefined,
      onTestProvider: () => undefined
    })
  );
}

describe("ProfileInspectorSidebar 渲染行为", () => {
  test("侧栏承载高频编辑、保存和测试", () => {
    const markup = renderSidebar();

    expect(markup).toContain("名称");
    expect(markup).toContain("目标接口 URL");
    expect(markup).toContain("HTTP 方法");
    expect(markup).toContain("Provider");
    expect(markup).toContain("本地 AI 配置项目路径");
    expect(markup).toContain("返回类型");
    expect(markup).toContain("保存配置");
    expect(markup).toContain("测试 Provider");
    expect(markup).toContain("Prompt");
    expect(markup).toContain("打开映射编辑器");
    expect(markup).toContain('role="switch"');
  });

  test("侧栏不承载完整协议实验室字段", () => {
    const markup = renderSidebar();

    expect(markup).not.toContain("消息返回结构");
    expect(markup).not.toContain("Stream Mappings JSON");
    expect(markup).not.toContain("Tool Event Policy");
    expect(markup).not.toContain("Mapping Security Policy");
    expect(markup).not.toContain("安全策略");
    expect(markup).not.toContain("复制诊断");
  });
});
