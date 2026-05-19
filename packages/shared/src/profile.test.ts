import { describe, expect, it } from "vitest";
import { normalizeProfile, normalizeProfiles } from "./profile";

describe("profile schema", () => {
  it("normalizes defaults for a minimal valid profile", () => {
    const profile = normalizeProfile({
      id: "openai-chat",
      name: "OpenAI Chat",
      targetOrigin: "https://api.openai.com",
      targetPath: "/v1/chat/completions",
      projectDir: "C:/project/demoProject/proxy2LocalAI"
    });

    expect(profile.enabled).toBe(true);
    expect(profile.methods).toEqual(["POST"]);
    expect(profile.provider).toBe("claude");
    expect(profile.responseMode).toBe("block");
    expect(profile.timeoutMs).toBe(0);
    expect(profile.maxBodyBytes).toBe(0);
  });

  it("allows zero timeoutMs as unlimited provider runtime", () => {
    const profile = normalizeProfile({
      id: "unlimited-timeout",
      name: "Unlimited Timeout",
      targetOrigin: "https://api.openai.com",
      targetPath: "/v1/chat/completions",
      projectDir: "C:/project/demoProject/proxy2LocalAI",
      timeoutMs: 0
    });

    expect(profile.timeoutMs).toBe(0);
  });

  it("allows zero maxBodyBytes as unlimited request body size", () => {
    const profile = normalizeProfile({
      id: "unlimited",
      name: "Unlimited",
      targetOrigin: "https://api.openai.com",
      targetPath: "/v1/chat/completions",
      projectDir: "C:/project/demoProject/proxy2LocalAI",
      maxBodyBytes: 0
    });

    expect(profile.maxBodyBytes).toBe(0);
  });

  it("rejects unsupported origins and unsafe project directories", () => {
    expect(() => normalizeProfile({
      id: "bad-origin",
      name: "Bad",
      targetOrigin: "file:///tmp/a",
      targetPath: "/api",
      projectDir: "C:/work"
    })).toThrow(/targetOrigin/);

    expect(() => normalizeProfile({
      id: "bad-dir",
      name: "Bad",
      targetOrigin: "https://example.com",
      targetPath: "/api",
      projectDir: ""
    })).toThrow(/projectDir/);
  });

  it("deduplicates and validates profile ids", () => {
    expect(() => normalizeProfiles([
      {
        id: "same",
        name: "A",
        targetOrigin: "https://example.com",
        targetPath: "/a",
        projectDir: "C:/work"
      },
      {
        id: "same",
        name: "B",
        targetOrigin: "https://example.com",
        targetPath: "/b",
        projectDir: "C:/work"
      }
    ])).toThrow(/重复/);
  });
});
