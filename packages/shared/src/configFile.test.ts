import { describe, expect, it } from "vitest";
import {
  createConfigExport,
  DEFAULT_BRIDGE_BASE_URL,
  DEFAULT_LOCAL_TOKEN,
  parseConfigImport,
  type AppConfig
} from "./index";

function createSampleConfig(): AppConfig {
  return {
    bridgeBaseUrl: DEFAULT_BRIDGE_BASE_URL,
    token: "local-secret-token",
    profiles: [
      {
        id: "openai-chat",
        name: "OpenAI Chat",
        enabled: true,
        targetOrigin: "https://api.openai.com",
        targetPath: "/v1/chat/completions",
        methods: ["POST"],
        projectDir: "C:/project/demoProject/proxy2LocalAI",
        provider: "claude",
        responseMode: "stream",
        prompt: "请用中文回答",
        timeoutMs: 0,
        maxBodyBytes: 0,
        sseDataEvents: ["message"]
      }
    ]
  };
}

describe("配置文件导入导出", () => {
  it("导出完整备份后可以无损导入", () => {
    const config = createSampleConfig();

    const exported = createConfigExport(config, { mode: "backup" });
    const imported = parseConfigImport(exported);

    expect(exported.app).toBe("Proxy2LocalAI");
    expect(exported.schemaVersion).toBe(1);
    expect(exported.config.token).toBe("local-secret-token");
    expect(imported).toEqual(config);
  });

  it("导出分享模板时会移除本机敏感信息并停用规则", () => {
    const config = createSampleConfig();

    const exported = createConfigExport(config, { mode: "template" });
    const imported = parseConfigImport(exported);

    expect(exported.config.token).toBeUndefined();
    expect(imported.token).toBe(DEFAULT_LOCAL_TOKEN);
    expect(imported.profiles[0]).toMatchObject({
      enabled: false,
      projectDir: "请在导入后填写本机项目路径"
    });
  });

  it("兼容直接导入旧版 AppConfig JSON", () => {
    const config = createSampleConfig();

    expect(parseConfigImport(config)).toEqual(config);
  });
});
