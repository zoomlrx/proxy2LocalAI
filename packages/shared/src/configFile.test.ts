import { describe, expect, test } from "vitest";
import {
  DEFAULT_LOCAL_TOKEN,
  TEMPLATE_PROJECT_DIR_PLACEHOLDER,
  createConfigExport,
  parseConfigImport,
  type AppConfig
} from "./index";

const baseConfig: AppConfig = {
  bridgeBaseUrl: "http://127.0.0.1:39399",
  token: "local-secret",
  profiles: [
    {
      id: "openai-chat",
      name: "OpenAI Chat",
      enabled: true,
      targetOrigin: "https://api.example.com",
      targetPath: "/v1/chat/completions",
      methods: ["POST"],
      projectDir: "C:/project/demoProject/proxy2LocalAI",
      provider: "claude",
      responseMode: "stream",
      timeoutMs: 1000,
      maxBodyBytes: 2048,
      sseDataEvents: ["message"]
    }
  ]
};

describe("配置文件导入导出", () => {
  test("导出分享模板时移除 token，并停用 profile", () => {
    const exported = createConfigExport(baseConfig, { mode: "template" });

    expect(exported.config.token).toBeUndefined();
    expect(exported.config.profiles).toHaveLength(1);
    expect(exported.config.profiles[0]?.enabled).toBe(false);
    expect(exported.config.profiles[0]?.projectDir).toBe(TEMPLATE_PROJECT_DIR_PLACEHOLDER);
  });

  test("导入不带 token 的分享模板时回退到本地默认 token", () => {
    const imported = parseConfigImport(createConfigExport(baseConfig, { mode: "template" }));

    expect(imported.token).toBe(DEFAULT_LOCAL_TOKEN);
    expect(imported.profiles[0]?.enabled).toBe(false);
  });
});
