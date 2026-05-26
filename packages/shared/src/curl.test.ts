import { describe, expect, test } from "vitest";
import { parseCurlCommand } from "./curl";

describe("cURL 解析", () => {
  test("解析 URL、方法、请求头和请求体样例", () => {
    const parsed = parseCurlCommand(`curl 'https://api.example.com/v1/chat/completions?debug=1' \
      -H 'content-type: application/json' \
      -H 'authorization: Bearer secret' \
      --data-raw '{"messages":[{"role":"user","content":"hi"}]}'`);

    expect(parsed.url).toBe("https://api.example.com/v1/chat/completions?debug=1");
    expect(parsed.method).toBe("POST");
    expect(parsed.headers["content-type"]).toBe("application/json");
    expect(parsed.headers.authorization).toBe("Bearer secret");
    expect(parsed.body).toBe('{"messages":[{"role":"user","content":"hi"}]}');
  });

  test("GET 请求无 body", () => {
    const parsed = parseCurlCommand("curl https://api.example.com/health");
    expect(parsed.method).toBe("GET");
    expect(parsed.body).toBeUndefined();
    expect(parsed.headers).toEqual({});
  });

  test("缺少 URL 时抛出错误", () => {
    expect(() => parseCurlCommand("curl -H 'x: y'")).toThrow("cURL 中未找到 URL");
  });
});
