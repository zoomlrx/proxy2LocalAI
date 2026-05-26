import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProfileEditor } from "./components/ProfileEditor";
import { createBlankProfile, type ProfileDraft } from "./profileForm";

function createDraft(): ProfileDraft {
  return {
    ...createBlankProfile(),
    id: "profile-test",
    name: "智能问答",
    targetOrigin: "https://api.example.com",
    targetPath: "/v1/chat/completions",
    projectDir: "C:\\project\\demoProject\\testVs"
  };
}

function renderProfileEditor(selectedProfile: { id: string } | null) {
  const draft = createDraft();
  return renderToStaticMarkup(
    React.createElement(ProfileEditor, {
      draft,
      curlText: "curl https://api.example.com/v1/chat/completions",
      selectedProfile,
      onChangeDraft: () => undefined,
      onChangeCurlText: () => undefined,
      onFillFromCurl: () => undefined,
      onOpenPathDialog: () => undefined,
      onSave: () => undefined,
      onDelete: () => undefined
    })
  );
}

describe("ProfileEditor 渲染行为", () => {
  test("新增规则时显示 cURL 导入区", () => {
    expect(renderProfileEditor(null)).toContain("粘贴 cURL 配置");
  });

  test("编辑已有规则时隐藏 cURL 导入区", () => {
    expect(renderProfileEditor({ id: "profile-test" })).not.toContain("粘贴 cURL 配置");
  });

  test("启用代理使用开关控件呈现", () => {
    const markup = renderProfileEditor({ id: "profile-test" });

    expect(markup).toContain("启用此代理");
    expect(markup).toContain('role="switch"');
  });
});
