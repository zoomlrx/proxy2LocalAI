import { describe, expect, test } from "vitest";
import type { NormalizedStreamEvent } from "./streamEvents";
import {
  DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
  renderStreamMappingFrame,
  renderStreamMappingFramesForEvent,
  validateSseEventName,
  type StreamMappingRule
} from "./streamMapping";

const messageEvent: NormalizedStreamEvent = {
  provider: "claude",
  eventId: "evt_000001",
  sequence: 1,
  turnId: "turn_test",
  kind: "delta",
  channel: "message",
  role: "assistant",
  content: "hello"
};

describe("stream mapping renderer", () => {
  test("把标准 message 事件渲染为确定的 JSON SSE frame", () => {
    const frame = renderStreamMappingFrame(messageEvent, {
      id: "chat",
      enabled: true,
      match: { kind: "delta", channel: "message" },
      emit: {
        protocol: "sse",
        event: "chat",
        data: {
          type: "answer.delta",
          content: "{{content}}",
          sequence: "{{sequence}}"
        }
      }
    });

    expect(frame?.frame).toBe('event: chat\ndata: {"type":"answer.delta","content":"hello","sequence":1}\n\n');
  });

  test("只渲染命中规则，未命中规则不产生 frame", () => {
    const frames = renderStreamMappingFramesForEvent(messageEvent, [
      {
        id: "reasoning",
        enabled: true,
        match: { kind: "delta", channel: "reasoning" },
        emit: { protocol: "sse", event: "reasoning", data: "{{content}}" }
      },
      {
        id: "message",
        enabled: true,
        match: { kind: "delta", channel: "message" },
        emit: { protocol: "sse", event: "message", data: "{{content}}" }
      }
    ]);

    expect(frames.map((frame) => frame.event)).toEqual(["message"]);
    expect(frames[0]?.frame).toBe('event: message\ndata: "hello"\n\n');
  });

  test("默认阻止 raw/data/tool.input/tool.output 这类危险变量输出", () => {
    const event: NormalizedStreamEvent = {
      ...messageEvent,
      raw: { secret: "token" },
      data: { full: "payload" }
    };
    const rule: StreamMappingRule = {
      id: "raw",
      enabled: true,
      match: { kind: "delta" },
      emit: { protocol: "sse", event: "debug", data: "{{raw}}" }
    };

    expect(() => renderStreamMappingFrame(event, rule, {
      ...DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
      rendererErrorPolicy: "throw"
    })).toThrow(/not allowed/);
  });

  test("缺失变量可按策略丢弃 frame", () => {
    const frame = renderStreamMappingFrame(messageEvent, {
      id: "missing",
      enabled: true,
      match: { kind: "delta" },
      emit: { protocol: "sse", event: "message", data: { text: "{{missing.path}}" } }
    }, {
      ...DEFAULT_RENDER_STREAM_MAPPING_OPTIONS,
      missingVariablePolicy: "drop_frame"
    });

    expect(frame).toBeNull();
  });

  test("SSE event 名称必须禁止空值、空白和换行", () => {
    expect(validateSseEventName("message.delta").ok).toBe(true);
    expect(validateSseEventName("bad event").ok).toBe(false);
    expect(validateSseEventName("bad\nevent").ok).toBe(false);
  });
});
