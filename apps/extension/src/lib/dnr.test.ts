import { describe, expect, it } from "vitest";
import { applyDynamicRules } from "./dnr";
import type { AppConfig } from "@proxy2localai/shared";

describe("applyDynamicRules", () => {
  it("removes old rules before adding current rules", async () => {
    const calls: unknown[] = [];
    const config: AppConfig = {
      bridgeBaseUrl: "http://127.0.0.1:39399",
      token: "token",
      profiles: [{
        id: "p1",
        name: "P1",
        enabled: true,
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        methods: ["POST"],
        projectDir: "C:/work",
        provider: "claude",
        responseMode: "block",
        timeoutMs: 120_000,
        maxBodyBytes: 262_144
      }]
    };

    await applyDynamicRules(config, {
      async getDynamicRules() {
        return [{ id: 10 }, { id: 11 }];
      },
      async updateDynamicRules(options) {
        calls.push(options);
      }
    });

    expect(calls[0]).toEqual({ removeRuleIds: [10, 11] });
    expect(calls[1]).toMatchObject({
      addRules: [{
        condition: {
          requestDomains: ["api.example.com"]
        }
      }]
    });
  });
});
