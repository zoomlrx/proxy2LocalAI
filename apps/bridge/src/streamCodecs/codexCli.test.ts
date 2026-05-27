import { describe, expect, test } from "vitest";
import { createCodexCliStreamCodec } from "./codexCli";

describe("Codex CLI stream codec", () => {
  test("text 事件标准化为 delta/message", () => {
    const codec = createCodexCliStreamCodec({ turnId: "turn_test" });
    const events = codec.decodeLine(JSON.stringify({
      type: "text",
      text: "hello"
    }));

    expect(events).toMatchObject([
      {
        provider: "codex",
        eventId: "evt_000001",
        sequence: 1,
        turnId: "turn_test",
        kind: "delta",
        channel: "message",
        content: "hello",
        meta: { providerEventType: "text" }
      }
    ]);
  });

  test("exec_approval_request 标准化为 tool_approval/tool", () => {
    const codec = createCodexCliStreamCodec({ turnId: "turn_test" });
    const events = codec.decodeLine(JSON.stringify({
      type: "exec_approval_request",
      command: "npm test",
      id: "approval_1"
    }));

    expect(events[0]).toMatchObject({
      provider: "codex",
      correlationId: "approval_1",
      kind: "tool_approval",
      channel: "tool",
      content: "Command approval required",
      tool: { name: "shell", status: "approval_required" },
      data: { reason: "exec_approval_request" }
    });
  });

  test("turn_complete 标准化为 done/status", () => {
    const codec = createCodexCliStreamCodec({ turnId: "turn_test" });
    const events = codec.decodeLine(JSON.stringify({
      type: "turn_complete",
      usage: { input_tokens: 10, output_tokens: 3 }
    }));

    expect(events[0]).toMatchObject({
      provider: "codex",
      kind: "done",
      channel: "status",
      meta: { providerEventType: "turn_complete" }
    });
  });
});
