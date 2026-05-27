import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProfileEditor } from "./components/ProfileEditor";
import { createBlankProfile, type ProfileDraft } from "./profileForm";

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
  test("基础配置展示 Anthropic 默认推荐和非原生路由提示", () => {
    const markup = renderProfileEditor();

    expect(markup).toContain("消息返回结构");
    expect(markup).toContain("Anthropic Messages（原生，推荐）");
    expect(markup).toContain("OpenAI Chat Completions（需开启路由转换）");
    expect(markup).toContain("OpenAI Responses API（需开启路由转换）");
    expect(markup).toContain("Gemini Native generateContent（需开启路由转换）");
    expect(markup).toContain("Bridge 会按所选结构抽取请求消息并包装响应");
  });
});
