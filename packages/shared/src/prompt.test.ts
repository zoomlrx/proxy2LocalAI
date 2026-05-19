import { describe, expect, it } from "vitest";
import { composePrompt } from "./prompt";

describe("composePrompt", () => {
  it("wraps request parameters with the configured prompt", () => {
    const prompt = composePrompt(
      { body: { message: "hello" }, query: { debug: "1" } },
      "请用中文回答"
    );

    expect(prompt).toContain("<parames>");
    expect(prompt).toContain("\"message\": \"hello\"");
    expect(prompt).toContain("</parames>");
    expect(prompt.endsWith("请用中文回答")).toBe(true);
  });

  it("omits extra whitespace when no user prompt is configured", () => {
    const prompt = composePrompt({ body: { ok: true } });

    expect(prompt).toBe("<parames>{\n  \"body\": {\n    \"ok\": true\n  }\n}</parames>");
  });
});
