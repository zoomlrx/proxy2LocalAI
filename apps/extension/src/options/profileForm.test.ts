import { describe, expect, it } from "vitest";
import { applyCurlToDraft, createBlankProfile, draftToProfile } from "./profileForm";

describe("profile form helpers", () => {
  it("creates a sensible default draft", () => {
    const draft = createBlankProfile("C:/work");

    expect(draft.provider).toBe("claude");
    expect(draft.responseMode).toBe("block");
    expect(draft.methods).toEqual(["POST"]);
    expect(draft.projectDir).toBe("C:/work");
    expect(draft.maxBodyBytes).toBe(0);
  });

  it("normalizes a draft to a proxy profile", () => {
    const profile = draftToProfile({
      ...createBlankProfile("C:/work"),
      id: "api-chat",
      name: "API Chat",
      targetOrigin: "https://api.example.com/",
      targetPath: "/chat"
    });

    expect(profile.targetOrigin).toBe("https://api.example.com");
    expect(profile.enabled).toBe(true);
  });

  it("fills target fields from a pasted curl command", () => {
    const draft = applyCurlToDraft(
      createBlankProfile("C:/work"),
      "curl 'https://api.openai.com/v1/chat/completions?debug=1' -X POST -H 'content-type: application/json' --data-raw '{\"messages\":[]}'"
    );

    expect(draft.targetOrigin).toBe("https://api.openai.com");
    expect(draft.targetPath).toBe("/v1/chat/completions");
    expect(draft.methods).toEqual(["POST"]);
    expect(draft.name).toBe("api.openai.com/v1/chat/completions");
  });

  it("infers GET for curl commands without a body", () => {
    const draft = applyCurlToDraft(
      createBlankProfile("C:/work"),
      "curl https://api.example.com/models"
    );

    expect(draft.targetOrigin).toBe("https://api.example.com");
    expect(draft.targetPath).toBe("/models");
    expect(draft.methods).toEqual(["GET"]);
  });
});
