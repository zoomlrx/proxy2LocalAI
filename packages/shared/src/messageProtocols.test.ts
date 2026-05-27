import { describe, expect, test } from "vitest";
import {
  createMessageProtocolJsonResponse,
  createMessageProtocolStreamChunk,
  createMessageProtocolStreamDone,
  createMessageProtocolStreamStart,
  routeMessageProtocolRequest
} from "./messageProtocols";

describe("message protocol request routing", () => {
  test("OpenAI Chat Completions 请求抽取 messages 作为 provider 输入", () => {
    const routed = routeMessageProtocolRequest({
      structure: "openai_chat_completions",
      targetPath: "/v1/chat/completions",
      body: {
        model: "gpt-4o",
        stream: true,
        messages: [
          { role: "system", content: "你是助手" },
          { role: "user", content: [{ type: "text", text: "你好" }] }
        ]
      }
    });

    expect(routed).toEqual({
      protocol: "openai_chat_completions",
      model: "gpt-4o",
      stream: true,
      messages: [
        { role: "system", content: "你是助手" },
        { role: "user", content: "你好" }
      ]
    });
  });

  test("OpenAI Responses 请求抽取 instructions 和 input", () => {
    const routed = routeMessageProtocolRequest({
      structure: "openai_responses",
      targetPath: "/v1/responses",
      body: {
        model: "gpt-5",
        instructions: "保持简洁",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "解释代理" }
            ]
          }
        ]
      }
    });

    expect(routed.messages).toEqual([
      { role: "system", content: "保持简洁" },
      { role: "user", content: "解释代理" }
    ]);
    expect(routed.model).toBe("gpt-5");
  });

  test("Gemini generateContent 请求抽取 contents 和 systemInstruction", () => {
    const routed = routeMessageProtocolRequest({
      structure: "gemini_generate_content",
      targetPath: "/v1beta/models/gemini-2.5-flash:generateContent",
      body: {
        systemInstruction: {
          parts: [{ text: "回答中文" }]
        },
        contents: [
          { role: "user", parts: [{ text: "介绍 Proxy2LocalAI" }] },
          { role: "model", parts: [{ text: "它是一个代理工具" }] }
        ]
      }
    });

    expect(routed).toMatchObject({
      protocol: "gemini_generate_content",
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "回答中文" },
        { role: "user", content: "介绍 Proxy2LocalAI" },
        { role: "assistant", content: "它是一个代理工具" }
      ]
    });
  });
});

describe("message protocol response rendering", () => {
  test("OpenAI Responses JSON 响应包含 output_text 和 message item", () => {
    const response = createMessageProtocolJsonResponse({
      structure: "openai_responses",
      content: "你好",
      model: "local-claude"
    }) as Record<string, unknown>;

    expect(response.object).toBe("response");
    expect(response.output_text).toBe("你好");
    expect(JSON.stringify(response)).toContain("\"type\":\"output_text\"");
  });

  test("Gemini JSON 响应包含 candidates content parts text", () => {
    const response = createMessageProtocolJsonResponse({
      structure: "gemini_generate_content",
      content: "你好",
      model: "local-claude"
    }) as Record<string, unknown>;

    expect(JSON.stringify(response)).toContain("\"candidates\"");
    expect(JSON.stringify(response)).toContain("\"text\":\"你好\"");
    expect(JSON.stringify(response)).toContain("\"finishReason\":\"STOP\"");
  });

  test("Responses 流式响应输出 output_text delta 和 completed 事件", () => {
    const start = createMessageProtocolStreamStart({
      structure: "openai_responses",
      model: "local-claude"
    });
    const chunk = createMessageProtocolStreamChunk({
      structure: "openai_responses",
      content: "你",
      model: "local-claude"
    });
    const done = createMessageProtocolStreamDone({
      structure: "openai_responses",
      content: "你好",
      model: "local-claude"
    });

    expect(start).toContain("event: response.created");
    expect(chunk).toContain("event: response.output_text.delta");
    expect(chunk).toContain('"delta":"你"');
    expect(done).toContain("event: response.completed");
  });
});
