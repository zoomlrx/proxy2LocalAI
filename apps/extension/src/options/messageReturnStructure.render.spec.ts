import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProfileEditor } from "./components/ProfileEditor";
import { createBlankProfile, MESSAGE_RETURN_STRUCTURE_OPTIONS, type ProfileDraft } from "./profileForm";

function createDraft(): ProfileDraft {
  return {
    ...createBlankProfile(),
    id: "profile-test",
    name: "Chat",
    targetOrigin: "https://api.example.com",
    targetPath: "/v1/messages",
    projectDir: "C:\\project\\demoProject\\testVs"
  };
}

function renderProfileEditor() {
  return renderToStaticMarkup(
    React.createElement(ProfileEditor, {
      draft: createDraft(),
      curlText: "curl https://api.example.com/v1/messages",
      selectedProfile: { id: "profile-test" },
      onChangeDraft: () => undefined,
      onChangeCurlText: () => undefined,
      onFillFromCurl: () => undefined,
      onOpenPathDialog: () => undefined,
      onSave: () => undefined,
      onDelete: () => undefined
    })
  );
}

describe("消息返回结构选择器渲染", () => {
  test("基础配置默认隐藏消息返回结构", () => {
    const markup = renderProfileEditor();

    expect(markup).toContain("高级配置");
    expect(markup).not.toContain("消息返回结构");
    expect(markup).not.toContain("OpenAI Chat Completions（需开启路由转换）");
  });

  test("消息返回结构选项仍保留 Anthropic 默认推荐和非原生路由提示", () => {
    expect(MESSAGE_RETURN_STRUCTURE_OPTIONS).toEqual([
      expect.objectContaining({ value: "anthropic_messages", recommended: true, routeRequired: false }),
      expect.objectContaining({ value: "openai_chat_completions", recommended: false, routeRequired: true }),
      expect.objectContaining({ value: "openai_responses", recommended: false, routeRequired: true }),
      expect.objectContaining({ value: "gemini_generate_content", recommended: false, routeRequired: true })
    ]);
  });
});
