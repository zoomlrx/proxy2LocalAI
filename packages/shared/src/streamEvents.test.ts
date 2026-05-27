import { describe, expect, test } from "vitest";
import { sanitizeStreamEventForMapping, type NormalizedStreamEvent } from "./streamEvents";

describe("stream event sanitization", () => {
  test("tool 事件即使允许映射 data/raw 变量，也不会保留原始 data/raw 绕过 toolPolicy", () => {
    const event: NormalizedStreamEvent = {
      provider: "claude",
      eventId: "evt_tool",
      sequence: 1,
      kind: "tool_call_delta",
      channel: "tool",
      content: "tool input",
      data: { input: { path: "C:/secret/file.ts" }, stdout: "完整输出" },
      raw: { command: "cat C:/secret/file.ts", token: "secret-token" },
      tool: {
        id: "tool-1",
        name: "Read",
        inputDelta: '{"path":"C:/secret/file.ts"}',
        output: "完整文件内容",
        status: "running"
      }
    };

    const sanitized = sanitizeStreamEventForMapping(event, {
      enabled: true,
      includeInput: "redacted",
      includeOutput: "summary",
      redactPaths: true,
      redactSecrets: true
    });

    expect(sanitized).not.toBeNull();
    expect(sanitized?.tool?.inputDelta).toBe("[redacted]");
    expect(sanitized?.tool?.output).toEqual({ type: "string", chars: 6 });
    expect(sanitized?.data).toEqual({ type: "object", chars: expect.any(Number) });
    expect(sanitized?.raw).toEqual({ type: "object", chars: expect.any(Number) });
    expect(JSON.stringify(sanitized)).not.toContain("secret-token");
    expect(JSON.stringify(sanitized)).not.toContain("C:/secret/file.ts");
  });

  test("debug/status/error 事件的 data/raw 默认降为摘要", () => {
    const event: NormalizedStreamEvent = {
      provider: "custom",
      eventId: "evt_debug",
      sequence: 2,
      kind: "raw",
      channel: "debug",
      data: { stderr: "token=secret-token" },
      raw: { cwd: "C:/secret/project" }
    };

    const sanitized = sanitizeStreamEventForMapping(event);

    expect(sanitized?.data).toEqual({ type: "object", chars: expect.any(Number) });
    expect(sanitized?.raw).toEqual({ type: "object", chars: expect.any(Number) });
    expect(JSON.stringify(sanitized)).not.toContain("secret-token");
    expect(JSON.stringify(sanitized)).not.toContain("C:/secret/project");
  });
});
