import { describe, expect, test } from "vitest";
import {
  DEFAULT_MAPPING_SECURITY_POLICY,
  DEFAULT_STREAM_DONE_POLICY,
  DEFAULT_TOOL_EVENT_POLICY,
  normalizeProfile
} from "./profile";

const baseProfile = {
  id: "chat",
  name: "Chat",
  enabled: true,
  targetOrigin: "https://api.example.com",
  targetPath: "/v1/chat/completions",
  methods: ["POST"],
  projectDir: "C:/project/demoProject/proxy2LocalAI",
  provider: "claude",
  responseMode: "mapped_sse",
  timeoutMs: 0,
  maxBodyBytes: 0
};

describe("stream mapping profile migration", () => {
  test("旧版 sseEventMappings 自动迁移为 streamMappings", () => {
    const profile = normalizeProfile({
      ...baseProfile,
      sseEventMappings: [
        { source: "reasoning", targetEvent: "reasoning" },
        { source: "message", targetEvent: "chat" }
      ],
      sseDoneEvent: {
        targetEvent: "finish",
        data: { status: "completed" }
      }
    });

    expect(profile.streamCodec).toBe("claude-code-v1");
    expect(profile.streamMappings).toEqual([
      {
        id: "legacy-reasoning",
        enabled: true,
        match: { kind: "delta", channel: "reasoning" },
        emit: { protocol: "sse", event: "reasoning", data: "{{content}}" }
      },
      {
        id: "legacy-message",
        enabled: true,
        match: { kind: "delta", channel: "message" },
        emit: { protocol: "sse", event: "chat", data: "{{content}}" }
      }
    ]);
    expect(profile.streamDoneEvent).toEqual({
      event: "finish",
      data: { status: "completed" }
    });
  });

  test("补齐默认映射安全策略、tool 策略和 done 策略", () => {
    const profile = normalizeProfile(baseProfile);

    expect(profile.mappingSecurityPolicy).toEqual(DEFAULT_MAPPING_SECURITY_POLICY);
    expect(profile.toolEventPolicy).toEqual(DEFAULT_TOOL_EVENT_POLICY);
    expect(profile.streamDonePolicy).toEqual(DEFAULT_STREAM_DONE_POLICY);
    expect(profile.streamDoneEvent?.event).toBe("done");
  });
});
