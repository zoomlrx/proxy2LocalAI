import { describe, expect, it } from "vitest";
import { createConfigStorage, STORAGE_KEY } from "./storage";

describe("config storage", () => {
  it("loads a default config when storage is empty", async () => {
    const saved: Record<string, unknown> = {};
    const storage = createConfigStorage({
      async get(key) {
        return { [key]: saved[key] };
      },
      async set(value) {
        Object.assign(saved, value);
      }
    });

    const config = await storage.load();

    expect(config.bridgeBaseUrl).toBe("http://127.0.0.1:39399");
    expect(config.profiles).toEqual([]);
  });

  it("normalizes profiles before saving", async () => {
    const saved: Record<string, unknown> = {};
    const storage = createConfigStorage({
      async get(key) {
        return { [key]: saved[key] };
      },
      async set(value) {
        Object.assign(saved, value);
      }
    });

    await storage.save({
      bridgeBaseUrl: "http://127.0.0.1:39399",
      token: "abc",
      profiles: [{
        id: "p1",
        name: "P1",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: "C:/work"
      }]
    });

    const stored = saved[STORAGE_KEY] as { profiles: Array<{ enabled: boolean; methods: string[] }> };
    expect(stored.profiles[0]?.enabled).toBe(true);
    expect(stored.profiles[0]?.methods).toEqual(["POST"]);
  });
});
