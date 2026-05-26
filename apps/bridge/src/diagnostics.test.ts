import { describe, expect, test } from "vitest";
import { createDiagnosticsStore } from "./diagnostics";

describe("诊断存储", () => {
  test("只保留最近 20 条请求摘要", () => {
    const store = createDiagnosticsStore({ limit: 20 });
    for (let index = 0; index < 21; index += 1) {
      store.startRequest({ id: `req-${index}`, method: "POST", targetUrl: `https://example.com/${index}` });
      store.finishRequest(`req-${index}`, { status: "ok" });
    }

    expect(store.listRecent()).toHaveLength(20);
    expect(store.listRecent()[0]?.id).toBe("req-1");
  });

  test("记录诊断阶段并获取详情", () => {
    const store = createDiagnosticsStore();
    store.startRequest({ id: "req-0", method: "POST", targetUrl: "https://example.com/api" });
    store.addStage("req-0", { id: "profile_matched", status: "ok" });
    store.addStage("req-0", { id: "provider_done", status: "ok", duration: 150 });
    store.finishRequest("req-0", { status: "ok" });

    const detail = store.getDetail("req-0");
    expect(detail).not.toBeNull();
    expect(detail!.stages).toHaveLength(2);
    expect(detail!.stages[0]?.id).toBe("profile_matched");
    expect(detail!.summary.finalStatus).toBe("ok");
    expect(detail!.summary.duration).toBeGreaterThanOrEqual(0);
  });

  test("错误请求记录错误阶段", () => {
    const store = createDiagnosticsStore();
    store.startRequest({ id: "req-err", method: "POST", targetUrl: "https://example.com/api" });
    store.addStage("req-err", { id: "profile_matched", status: "ok" });
    store.addStage("req-err", { id: "provider_no_output", status: "error", message: "AI 未返回内容" });
    store.finishRequest("req-err", { status: "error", errorStage: "provider_no_output" });

    const detail = store.getDetail("req-err");
    expect(detail!.summary.finalStatus).toBe("error");
    expect(detail!.summary.errorStage).toBe("provider_no_output");
  });

  test("获取不存在的请求返回 null", () => {
    const store = createDiagnosticsStore();
    expect(store.getDetail("nonexistent")).toBeNull();
  });
});
