import { describe, expect, test } from "vitest";
import { redactDiagnosticText, redactHeaders } from "./redaction";

describe("诊断脱敏", () => {
  test("导出诊断时脱敏 token、authorization 和 cookie", () => {
    const text = redactDiagnosticText("authorization: Bearer abc\ncookie: sid=123\ntoken=test");
    expect(text).not.toContain("Bearer abc");
    expect(text).not.toContain("sid=123");
    expect(text).toContain("[REDACTED]");
  });

  test("脱敏请求头中的敏感字段", () => {
    const headers = redactHeaders({
      "content-type": "application/json",
      "authorization": "Bearer secret-token",
      "cookie": "session=abc123",
      "x-api-key": "my-key"
    });
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["authorization"]).toBe("[REDACTED]");
    expect(headers["cookie"]).toBe("[REDACTED]");
    expect(headers["x-api-key"]).toBe("[REDACTED]");
  });
});
