import { describe, expect, it } from "vitest";
import { createCliProvider, createProviderCommand, createProviderLogger, extractTextFromProviderLine } from "./providers";
import type { ProxyProfile } from "@proxy2localai/shared";

const baseProfile: ProxyProfile = {
  id: "p1",
  name: "Test",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/chat",
  methods: ["POST"],
  projectDir: "C:/work",
  provider: "claude",
  responseMode: "stream",
  timeoutMs: 120000,
  maxBodyBytes: 0
};

describe("provider output parsing", () => {
  it("extracts Claude JSON result text", () => {
    expect(extractTextFromProviderLine(JSON.stringify({
      type: "result",
      result: "完成"
    }))).toBe("完成");
  });

  it("extracts nested content arrays from stream JSON", () => {
    expect(extractTextFromProviderLine(JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "你" },
          { type: "text", text: "好" }
        ]
      }
    }))).toBe("你好");
  });

  it("keeps plain text lines for custom providers", () => {
    expect(extractTextFromProviderLine("plain output")).toBe("plain output");
  });

  it("ignores Claude final assistant and result summaries in stream mode", () => {
    const assistantLine = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "final answer" }
        ]
      }
    });
    const resultLine = JSON.stringify({
      type: "result",
      result: "final answer"
    });

    expect(extractTextFromProviderLine(assistantLine, { streaming: true })).toBe("");
    expect(extractTextFromProviderLine(resultLine, { streaming: true })).toBe("");
    expect(extractTextFromProviderLine(assistantLine)).toBe("final answer");
    expect(extractTextFromProviderLine(resultLine)).toBe("final answer");
  });

  it("ignores Claude tool results when parsing provider output", () => {
    expect(extractTextFromProviderLine(JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "No matching deferred tools found"
          }
        ]
      }
    }))).toBe("");
  });

  it("extracts Claude stream text deltas", () => {
    expect(extractTextFromProviderLine(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: "123"
        }
      }
    }))).toBe("123");
  });

  it("creates noop provider loggers when no log path is configured", () => {
    const logger = createProviderLogger();
    expect(() => logger({ stage: "provider_spawn", command: "claude" })).not.toThrow();
  });

  it("adds verbose mode when streaming Claude JSON output", () => {
    const command = createProviderCommand(baseProfile, true);

    expect(command.command).toBe("claude");
    expect(command.args).toContain("--verbose");
    expect(command.args).toContain("stream-json");
  });

  it("disables Claude tools in proxy mode", () => {
    const streamCommand = createProviderCommand(baseProfile, true);
    const blockCommand = createProviderCommand(baseProfile, false);

    expect(streamCommand.args).toEqual(expect.arrayContaining(["--tools", ""]));
    expect(blockCommand.args).toEqual(expect.arrayContaining(["--tools", ""]));
  });

  it("reports provider timeouts explicitly", async () => {
    const provider = createCliProvider();
    const script = "process.stdin.resume(); setTimeout(() => {}, 10000);";

    await expect(provider.generateText({
      ...baseProfile,
      provider: "custom",
      responseMode: "block",
      projectDir: process.cwd(),
      timeoutMs: 20,
      customCommand: process.execPath,
      customArgs: ["-e", script]
    }, "prompt")).rejects.toThrow("超时 20ms");
  });

  it("does not terminate providers when timeoutMs is zero", async () => {
    const provider = createCliProvider();
    const script = [
      "process.stdin.resume();",
      "setTimeout(() => console.log(JSON.stringify({ text: 'after-wait' })), 40);"
    ].join(" ");

    await expect(provider.generateText({
      ...baseProfile,
      provider: "custom",
      responseMode: "block",
      projectDir: process.cwd(),
      timeoutMs: 0,
      customCommand: process.execPath,
      customArgs: ["-e", script]
    }, "prompt")).resolves.toBe("after-wait");
  });
});
