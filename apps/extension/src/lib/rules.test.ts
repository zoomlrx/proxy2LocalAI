import { describe, expect, test } from "vitest";
import type { AppConfig } from "@proxy2localai/shared";
import { buildDynamicRules } from "./rules";

const config: AppConfig = {
  bridgeBaseUrl: "http://127.0.0.1:39399",
  token: "local-token",
  profiles: [
    {
      id: "chat",
      name: "Chat",
      enabled: true,
      targetOrigin: "https://api.example.com",
      targetPath: "/v1/chat/completions",
      methods: ["POST"],
      projectDir: "C:/project/demoProject/proxy2LocalAI",
      provider: "claude",
      responseMode: "block",
      timeoutMs: 0,
      maxBodyBytes: 0,
      sseDataEvents: ["message"]
    },
    {
      id: "disabled",
      name: "Disabled",
      enabled: false,
      targetOrigin: "https://api.example.com",
      targetPath: "/disabled",
      methods: ["POST"],
      projectDir: "C:/project/demoProject/proxy2LocalAI",
      provider: "codex",
      responseMode: "block",
      timeoutMs: 0,
      maxBodyBytes: 0,
      sseDataEvents: ["message"]
    }
  ]
};

describe("DNR 动态规则", () => {
  test("只为启用 profile 生成指向本地 Bridge 的重定向规则", () => {
    const rules = buildDynamicRules(config);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.redirect?.transform).toMatchObject({
      scheme: "http",
      host: "127.0.0.1",
      port: "39399",
      path: "/proxy/chat"
    });
    expect(rules[0]?.condition.requestDomains).toEqual(["api.example.com"]);
    expect(rules[0]?.condition.requestMethods).toEqual(["post"]);
  });

  test("把本地 token 写入 Bridge 查询参数", () => {
    const [rule] = buildDynamicRules(config);

    expect(rule?.action.redirect?.transform?.queryTransform?.addOrReplaceParams).toEqual([
      {
        key: "token",
        value: "local-token"
      }
    ]);
  });
});
