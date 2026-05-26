import { describe, expect, test } from "vitest";
import { composePrompt, extractPromptContext, type ConversationTurn } from "./prompt";

const parameters = {
  page: {
    url: "https://demo.example/chat",
    origin: "https://demo.example"
  },
  request: {
    method: "POST",
    body: {
      message: "请介绍这个项目",
      noise: "这段内容不应该进入上下文"
    }
  }
};

describe("Prompt 上下文拼装", () => {
  test("未配置正则时保持原有完整参数格式", () => {
    expect(composePrompt({ hello: "world" })).toBe("<parames>{\n  \"hello\": \"world\"\n}</parames>");
  });

  test("根据正则提取第一个捕获组作为上下文", () => {
    const context = extractPromptContext(parameters, {
      contextRegex: "\"message\"\\s*:\\s*\"([^\"]+)\""
    });

    expect(context).toBe("请介绍这个项目");
  });

  test("拼装多轮历史时保留历史问答和当前上下文", () => {
    const history: ConversationTurn[] = [
      { role: "user", content: "第一轮问题" },
      { role: "assistant", content: "第一轮回答" }
    ];

    const prompt = composePrompt(parameters, "请继续回答", {
      contextRegex: "\"message\"\\s*:\\s*\"([^\"]+)\"",
      conversationHistory: history
    });

    expect(prompt).toContain("<history>");
    expect(prompt).toContain("<turn role=\"user\">第一轮问题</turn>");
    expect(prompt).toContain("<turn role=\"assistant\">第一轮回答</turn>");
    expect(prompt).toContain("<parames>请介绍这个项目</parames>");
    expect(prompt.endsWith("请继续回答")).toBe(true);
  });
});
