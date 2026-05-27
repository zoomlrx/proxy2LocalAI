import { describe, expect, test } from "vitest";
import { createClaudeCodeStreamCodec } from "./claudeCode";

describe("Claude Code stream codec", () => {
  test("text_delta 标准化为 delta/message", () => {
    const codec = createClaudeCodeStreamCodec({ turnId: "turn_test" });
    const events = codec.decodeLine(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "你好" }
      }
    }));

    expect(events).toMatchObject([
      {
        provider: "claude",
        eventId: "evt_000001",
        sequence: 1,
        turnId: "turn_test",
        blockIndex: 0,
        kind: "delta",
        channel: "message",
        content: "你好",
        meta: { providerEventType: "content_block_delta" }
      }
    ]);
  });

  test("thinking_delta 标准化为 delta/reasoning", () => {
    const codec = createClaudeCodeStreamCodec({ turnId: "turn_test" });
    const events = codec.decodeLine(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "先分析" }
      }
    }));

    expect(events[0]).toMatchObject({
      provider: "claude",
      kind: "delta",
      channel: "reasoning",
      content: "先分析"
    });
  });

  test("tool_use start/input_json_delta/stop 串成同一个 correlationId", () => {
    const codec = createClaudeCodeStreamCodec({ turnId: "turn_test" });
    const start = codec.decodeLine(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "toolu_1", name: "Read", input: {} }
      }
    }));
    const delta = codec.decodeLine(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: "{\"path\":\"[redacted]\"}" }
      }
    }));
    const stop = codec.decodeLine(JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_stop", index: 1 }
    }));

    expect(start[0]).toMatchObject({
      kind: "tool_call_start",
      channel: "tool",
      correlationId: "toolu_1",
      tool: { id: "toolu_1", name: "Read", status: "started" }
    });
    expect(delta[0]).toMatchObject({
      kind: "tool_call_delta",
      channel: "tool",
      correlationId: "toolu_1",
      tool: { id: "toolu_1", name: "Read", inputDelta: "{\"path\":\"[redacted]\"}", status: "running" }
    });
    expect(stop[0]).toMatchObject({
      kind: "tool_call_end",
      channel: "tool",
      correlationId: "toolu_1",
      tool: { id: "toolu_1", name: "Read", status: "completed" }
    });
  });
});
