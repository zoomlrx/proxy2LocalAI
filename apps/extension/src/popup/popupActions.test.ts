import { describe, expect, test } from "vitest";
import type { AppConfig } from "@proxy2localai/shared";
import { toggleProfileEnabledTransaction } from "./popupActions";

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
      projectDir: "",
      provider: "claude",
      responseMode: "stream",
      messageReturnStructure: "anthropic_messages",
      allowDangerousCli: false,
      enableConversationMemory: false,
      timeoutMs: 0,
      maxBodyBytes: 0,
      contextRegexFlags: "s",
      sseDataEvents: ["message"],
      setupMode: "advanced",
      responseTemplateId: "openai_sse",
      sensitiveHeaderPolicy: "default",
      debugEnabled: true
    }
  ]
};

describe("Popup Profile 启停事务", () => {
  test("同步失败时不提交新配置，并尝试回滚到原配置", async () => {
    const synced: AppConfig[] = [];
    const saved: AppConfig[] = [];

    const result = await toggleProfileEnabledTransaction(config, "chat", {
      requestPermission: async () => true,
      sync: async (nextConfig) => {
        synced.push(nextConfig);
        if (synced.length === 1) {
          throw new Error("sync failed");
        }
      },
      save: async (nextConfig) => {
        saved.push(nextConfig);
        return nextConfig;
      }
    });

    expect(result.ok).toBe(false);
    expect(result.config.profiles[0]?.enabled).toBe(true);
    expect(synced).toHaveLength(2);
    expect(synced[1]?.profiles[0]?.enabled).toBe(true);
    expect(saved[0]?.profiles[0]?.enabled).toBe(true);
  });

  test("同步和保存成功后才返回新配置", async () => {
    const result = await toggleProfileEnabledTransaction(config, "chat", {
      requestPermission: async () => true,
      sync: async () => undefined,
      save: async (nextConfig) => nextConfig
    });

    expect(result.ok).toBe(true);
    expect(result.config.profiles[0]?.enabled).toBe(false);
  });
});
