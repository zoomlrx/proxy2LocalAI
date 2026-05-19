import { describe, expect, it } from "vitest";
import { buildDynamicRules } from "./rules";

describe("buildDynamicRules", () => {
  it("builds one redirect rule per enabled profile", () => {
    const rules = buildDynamicRules({
      bridgeBaseUrl: "http://127.0.0.1:39399",
      token: "local-token",
      profiles: [
        {
          id: "openai-chat",
          name: "OpenAI Chat",
          enabled: true,
          targetOrigin: "https://api.openai.com",
          targetPath: "/v1/chat/completions",
          methods: ["POST"],
          projectDir: "C:/work",
          provider: "claude",
          responseMode: "stream",
          timeoutMs: 120_000,
          maxBodyBytes: 262_144
        },
        {
          id: "disabled",
          name: "Disabled",
          enabled: false,
          targetOrigin: "https://api.example.com",
          targetPath: "/chat",
          methods: ["POST"],
          projectDir: "C:/work",
          provider: "codex",
          responseMode: "block",
          timeoutMs: 120_000,
          maxBodyBytes: 262_144
        }
      ]
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.requestDomains).toEqual(["api.openai.com"]);
    expect(rules[0]?.condition.requestMethods).toEqual(["post"]);
    expect(rules[0]?.action.redirect?.transform).toMatchObject({
      scheme: "http",
      host: "127.0.0.1",
      port: "39399",
      path: "/proxy/openai-chat"
    });
    expect(rules[0]?.action.redirect?.transform?.queryTransform?.addOrReplaceParams).toContainEqual({
      key: "token",
      value: "local-token"
    });
  });
});
