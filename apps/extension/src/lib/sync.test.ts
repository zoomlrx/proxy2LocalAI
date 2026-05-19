import { describe, expect, it } from "vitest";
import { syncBridgeThenApplyRules } from "./sync";
import type { AppConfig } from "@proxy2localai/shared";

describe("syncBridgeThenApplyRules", () => {
  it("syncs bridge profiles before applying DNR rules", async () => {
    const calls: string[] = [];
    const config: AppConfig = {
      bridgeBaseUrl: "http://127.0.0.1:39399",
      token: "token",
      profiles: []
    };

    await syncBridgeThenApplyRules(config, {
      syncProfiles: async () => {
        calls.push("sync");
      },
      applyRules: async () => {
        calls.push("rules");
      }
    });

    expect(calls).toEqual(["sync", "rules"]);
  });
});
