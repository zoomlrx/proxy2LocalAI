import { describe, expect, it } from "vitest";
import {
  createChatCompletion,
  createErrorResponse,
  createStreamChunk,
  createStreamDone
} from "./openai";

describe("OpenAI-compatible response helpers", () => {
  it("creates a block chat completion", () => {
    const response = createChatCompletion({
      id: "chatcmpl-test",
      content: "你好",
      model: "local-claude"
    });

    expect(response.object).toBe("chat.completion");
    expect(response.choices[0]?.message.content).toBe("你好");
    expect(response.choices[0]?.finish_reason).toBe("stop");
  });

  it("creates stream chunks and done marker", () => {
    const chunk = createStreamChunk({
      id: "chatcmpl-test",
      content: "你",
      model: "local-codex"
    });

    expect(chunk).toContain("data: ");
    expect(chunk).toContain("\"object\":\"chat.completion.chunk\"");
    expect(chunk).toContain("\"content\":\"你\"");
    expect(createStreamDone()).toBe("data: [DONE]\n\n");
  });

  it("creates an OpenAI-style error response", () => {
    expect(createErrorResponse("bad_request", "配置不存在").error).toEqual({
      type: "bad_request",
      message: "配置不存在"
    });
  });

  it("preserves optional error details for diagnostics", () => {
    expect(createErrorResponse("not_found", "配置不存在", {
      profileId: "missing",
      knownProfileIds: ["known"]
    }).error).toMatchObject({
      profileId: "missing",
      knownProfileIds: ["known"]
    });
  });
});
