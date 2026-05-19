import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridgeServer } from "./server";
import type { BridgeServerOptions } from "./server";
import type { AiProviderAdapter } from "./providers";

const token = "test-token";
const servers: ReturnType<typeof createBridgeServer>[] = [];
const tempDirs: string[] = [];
let testProfilesPath = "";

beforeEach(async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "proxy2localai-test-"));
  tempDirs.push(dataDir);
  testProfilesPath = join(dataDir, "profiles.json");
});

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function listen(server: ReturnType<typeof createBridgeServer>) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => {
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  });
}

function createTestBridgeServer(options: BridgeServerOptions = {}) {
  return createBridgeServer({
    ...options,
    profilesPath: options.profilesPath ?? testProfilesPath
  });
}

async function httpJson(baseUrl: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const url = new URL(path, baseUrl);
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers
      }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: data
      }));
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function httpRaw(baseUrl: string, method: string, path: string, headers: Record<string, string> = {}) {
  const url = new URL(path, baseUrl);
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: data
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("bridge server", () => {
  const fakeProvider: AiProviderAdapter = {
    async generateText(_profile, prompt) {
      return `AI:${prompt.slice(0, 18)}`;
    },
    async *streamText() {
      yield "你";
      yield "好";
    }
  };

  it("syncs profiles and returns block OpenAI-compatible JSON", async () => {
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: fakeProvider
      }
    });
    const baseUrl = await listen(server);

    const sync = await httpJson(baseUrl, "PUT", "/admin/profiles", {
      profiles: [{
        id: "p1",
        name: "测试",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: "C:/work"
      }]
    }, { "x-proxy2localai-token": token });

    expect(sync.status).toBe(200);

    const response = await httpJson(baseUrl, "POST", `/proxy/p1?token=${token}`, {
      messages: [{ role: "user", content: "hello" }]
    });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    const json = JSON.parse(response.body);
    expect(json.object).toBe("chat.completion");
    expect(json.choices[0].message.content).toContain("AI:<parames>");
  });

  it("echoes CORS origin and requested headers for credentialed browser requests", async () => {
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: fakeProvider
      }
    });
    const baseUrl = await listen(server);

    const response = await httpRaw(baseUrl, "OPTIONS", "/proxy/p1", {
      origin: "https://ai-chat.example.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,applicationid,x-custom-token",
      "access-control-request-private-network": "true"
    });

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://ai-chat.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toBe("content-type,applicationid,x-custom-token");
    expect(response.headers["access-control-allow-private-network"]).toBe("true");
  });

  it("streams OpenAI-compatible SSE chunks", async () => {
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: fakeProvider
      }
    });
    const baseUrl = await listen(server);

    await httpJson(baseUrl, "PUT", "/admin/profiles", {
      profiles: [{
        id: "p2",
        name: "流式",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: "C:/work",
        responseMode: "stream"
      }]
    }, { "x-proxy2localai-token": token });

    const response = await httpJson(baseUrl, "POST", `/proxy/p2?token=${token}`, { q: "hello" });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: proxy_status");
    expect(response.body).toContain("\"stage\":\"provider_start\"");
    expect(response.body).toContain("\"content\":\"你\"");
    expect(response.body).toContain("data: [DONE]");
  });

  it("writes CLI provider spawn and output diagnostics to the request log", async () => {
    const dataDir = tempDirs[0]!;
    const requestsLogPath = join(dataDir, "requests.log");
    const server = createTestBridgeServer({
      token,
      requestsLogPath
    });
    const baseUrl = await listen(server);
    const script = [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => console.log(JSON.stringify({ text: 'cli-ok:' + input.length })));"
    ].join(" ");

    await httpJson(baseUrl, "PUT", "/admin/profiles", {
      profiles: [{
        id: "cli-log",
        name: "CLI Log",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: dataDir,
        provider: "custom",
        responseMode: "stream",
        customCommand: process.execPath,
        customArgs: ["-e", script]
      }]
    }, { "x-proxy2localai-token": token });

    const response = await httpJson(baseUrl, "POST", `/proxy/cli-log?token=${token}`, { q: "hello" });
    const log = await readFile(requestsLogPath, "utf8");

    expect(response.status).toBe(200);
    expect(response.body).toContain("cli-ok:");
    expect(response.body).toContain("\"stage\":\"provider_spawn\"");
    expect(response.body).toContain("\"stage\":\"provider_stdout_line\"");
    expect(log).toContain("\"stage\":\"provider_start\"");
    expect(log).toContain("\"stage\":\"provider_spawn\"");
    expect(log).toContain("\"stage\":\"provider_stdout_line\"");
    expect(log).toContain("\"stage\":\"provider_done\"");
  });

  it("adds the current page url to the AI context", async () => {
    let capturedPrompt = "";
    const capturingProvider: AiProviderAdapter = {
      async generateText(_profile, prompt) {
        capturedPrompt = prompt;
        return "ok";
      },
      async *streamText() {
        yield "ok";
      }
    };
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: capturingProvider
      }
    });
    const baseUrl = await listen(server);

    await httpJson(baseUrl, "PUT", "/admin/profiles", {
      profiles: [{
        id: "p3",
        name: "Page Context",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: "C:/work"
      }]
    }, { "x-proxy2localai-token": token });

    const response = await httpJson(baseUrl, "POST", `/proxy/p3?token=${token}`, { q: "hello" }, {
      "x-proxy2localai-page-url": "https://app.example.com/workspace/123?tab=chat",
      referer: "https://fallback.example.com/page",
      origin: "https://origin.example.com"
    });

    expect(response.status).toBe(200);
    expect(capturedPrompt).toContain("\"page\"");
    expect(capturedPrompt).toContain("\"url\": \"https://app.example.com/workspace/123?tab=chat\"");
    expect(capturedPrompt).toContain("\"source\": \"x-proxy2localai-page-url\"");
  });

  it("rejects missing tokens before invoking providers", async () => {
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: fakeProvider
      }
    });
    const baseUrl = await listen(server);

    const response = await httpJson(baseUrl, "PUT", "/admin/profiles", { profiles: [] });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body).error.type).toBe("unauthorized");
  });

  it("lists synced profiles for troubleshooting", async () => {
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: fakeProvider
      }
    });
    const baseUrl = await listen(server);

    await httpJson(baseUrl, "PUT", "/admin/profiles", {
      profiles: [{
        id: "debug-id",
        name: "Debug",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: "C:/work"
      }]
    }, { "x-proxy2localai-token": token });

    const response = await httpJson(baseUrl, "GET", "/admin/profiles", undefined, {
      "x-proxy2localai-token": token
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).profiles[0]).toMatchObject({
      id: "debug-id",
      enabled: true,
      targetPath: "/chat"
    });
  });

  it("includes requested and known profile ids in not_found responses", async () => {
    const server = createTestBridgeServer({
      token,
      providers: {
        claude: fakeProvider
      }
    });
    const baseUrl = await listen(server);

    await httpJson(baseUrl, "PUT", "/admin/profiles", {
      profiles: [{
        id: "known-id",
        name: "Known",
        targetOrigin: "https://api.example.com",
        targetPath: "/chat",
        projectDir: "C:/work"
      }]
    }, { "x-proxy2localai-token": token });

    const response = await httpJson(baseUrl, "POST", `/proxy/missing-id?token=${token}`, { q: "hello" });
    const json = JSON.parse(response.body);

    expect(response.status).toBe(404);
    expect(json.error).toMatchObject({
      type: "not_found",
      profileId: "missing-id",
      knownProfileIds: ["known-id"]
    });
  });

  it("restores synced profiles after a bridge restart", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "proxy2localai-"));
    const profilesPath = join(dataDir, "profiles.json");
    try {
      const firstServer = createTestBridgeServer({
        token,
        profilesPath,
        providers: {
          claude: fakeProvider
        }
      });
      const firstBaseUrl = await listen(firstServer);

      await httpJson(firstBaseUrl, "PUT", "/admin/profiles", {
        profiles: [{
          id: "persisted",
          name: "Persisted",
          targetOrigin: "https://api.example.com",
          targetPath: "/chat",
          projectDir: "C:/work"
        }]
      }, { "x-proxy2localai-token": token });
      await new Promise<void>((resolve) => firstServer.close(() => resolve()));
      servers.splice(servers.indexOf(firstServer), 1);

      const secondServer = createTestBridgeServer({
        token,
        profilesPath,
        providers: {
          claude: fakeProvider
        }
      });
      const secondBaseUrl = await listen(secondServer);

      const health = await httpJson(secondBaseUrl, "GET", "/health");
      expect(JSON.parse(health.body).profileCount).toBe(1);

      const response = await httpJson(secondBaseUrl, "POST", `/proxy/persisted?token=${token}`, { q: "hello" });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).object).toBe("chat.completion");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
