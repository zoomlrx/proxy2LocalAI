import { describe, expect, test } from "vitest";
import type { ProxyProfile } from "@proxy2localai/shared";
import { createProviderCommand } from "./providers";

const baseProfile: ProxyProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
  provider: "claude",
  responseMode: "block",
  messageReturnStructure: "anthropic_messages",
  timeoutMs: 0,
  maxBodyBytes: 0,
  sseDataEvents: ["message"],
  allowDangerousCli: false,
  enableConversationMemory: false,
  contextRegexFlags: "s",
  setupMode: "advanced",
  responseTemplateId: "openai_chat_json",
  sensitiveHeaderPolicy: "default",
  debugEnabled: true,
};

describe("Provider 命令", () => {
  test("Claude 默认不启用跳过权限检查的危险参数", () => {
    const command = createProviderCommand(baseProfile, false);

    expect(command.args).not.toContain("--dangerously-skip-permissions");
  });

  test("Claude 在显式允许危险 CLI 模式时才启用跳过权限检查", () => {
    const command = createProviderCommand(baseProfile, false, { allowDangerousCli: true });

    expect(command.args).toContain("--dangerously-skip-permissions");
  });

  test("Codex 默认不启用 full-auto", () => {
    const command = createProviderCommand({
      ...baseProfile,
      provider: "codex"
    }, false);

    expect(command.args).not.toContain("--full-auto");
  });

  test("Codex 在显式允许危险 CLI 模式时才启用 full-auto", () => {
    const command = createProviderCommand({
      ...baseProfile,
      provider: "codex"
    }, false, { allowDangerousCli: true });

    expect(command.args).toContain("--full-auto");
  });

  test("Claude provider 追加参数默认不生效", () => {
    const command = createProviderCommand({
      ...baseProfile,
      provider: "claude",
      providerArgs: ["--debug"]
    }, false);

    expect(command.args).not.toContain("--debug");
  });

  test("Codex provider 追加参数仅在允许高风险 CLI 时生效", () => {
    const command = createProviderCommand({
      ...baseProfile,
      provider: "codex",
      providerArgs: ["--dangerous-flag"]
    }, false, { allowDangerousCli: true });

    expect(command.args).toContain("--dangerous-flag");
  });
});
