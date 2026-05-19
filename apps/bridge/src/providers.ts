import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import type { AiProvider, ProxyProfile } from "@proxy2localai/shared";

export interface AiProviderAdapter {
  generateText(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): Promise<string>;
  streamText(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): AsyncIterable<string>;
}

export type ProviderRegistry = Partial<Record<AiProvider, AiProviderAdapter>>;
export type ProviderLogger = (event: Record<string, unknown>) => void;

export interface ProviderRunContext {
  onEvent?: (event: Record<string, unknown>) => void;
}

export interface CommandSpec {
  command: string;
  args: string[];
}

interface ExtractTextOptions {
  streaming?: boolean;
}

interface TimeoutHandle {
  timer?: NodeJS.Timeout;
  timedOut(): boolean;
}

interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

let providerLogger: ProviderLogger = () => undefined;

export function createProviderLogger(logPath?: string): ProviderLogger {
  if (!logPath) {
    return () => undefined;
  }
  return (event) => {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event
    })}\n`, "utf8");
  };
}

export function setProviderLogger(logger: ProviderLogger): void {
  providerLogger = logger;
}

function emitProviderEvent(context: ProviderRunContext | undefined, event: Record<string, unknown>): void {
  providerLogger(event);
  context?.onEvent?.(event);
}

export function extractTextFromProviderLine(line: string, options: ExtractTextOptions = {}): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const extracted = options.streaming ? extractStreamingProviderText(parsed) : extractProviderText(parsed);
    return extracted || "";
  } catch {
    return line;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractProviderText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractProviderText).join("");
  }
  if (!isRecord(value)) {
    return "";
  }

  const record = value;
  if (record.type === "result" && typeof record.result === "string") {
    return record.result;
  }
  if (record.type === "stream_event") {
    return extractClaudeStreamEventText(record.event);
  }
  if (record.type === "assistant") {
    return extractClaudeAssistantText(record.message);
  }
  if (record.type !== undefined) {
    return "";
  }

  return extractCustomProviderText(record);
}

function extractStreamingProviderText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractStreamingProviderText).join("");
  }
  if (!isRecord(value)) {
    return "";
  }

  if (value.type === "stream_event") {
    return extractClaudeStreamEventText(value.event);
  }
  if (value.type === undefined) {
    return extractCustomProviderText(value);
  }
  return "";
}

function extractClaudeStreamEventText(event: unknown): string {
  if (!isRecord(event) || event.type !== "content_block_delta" || !isRecord(event.delta)) {
    return "";
  }
  if (event.delta.type === "text_delta" && typeof event.delta.text === "string") {
    return event.delta.text;
  }
  return "";
}

function extractClaudeAssistantText(message: unknown): string {
  if (!isRecord(message)) {
    return "";
  }
  return extractTextBlocks(message.content);
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .join("");
}

function extractCustomProviderText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractCustomProviderText).join("");
  }
  if (!isRecord(value)) {
    return "";
  }

  const record = value;
  if (record.type !== undefined && record.type !== "text") {
    return "";
  }
  if (typeof record.result === "string") {
    return record.result;
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.content === "string") {
    return record.content;
  }
  if (record.content !== undefined) {
    return extractCustomProviderText(record.content);
  }
  if (record.delta !== undefined) {
    return extractCustomProviderText(record.delta);
  }
  if (record.message !== undefined) {
    return extractCustomProviderText(record.message);
  }
  return "";
}

export function createProviderCommand(profile: ProxyProfile, streaming: boolean): CommandSpec {
  if (profile.provider === "claude") {
    return {
      command: "claude",
      args: [
        "-p",
        "--output-format",
        streaming ? "stream-json" : "json",
        ...(streaming ? ["--verbose", "--include-partial-messages"] : []),
        "--tools",
        ""
      ]
    };
  }

  if (profile.provider === "codex") {
    return {
      command: "codex",
      args: [
        "exec",
        "--skip-git-repo-check",
        "--json",
        "-C",
        profile.projectDir,
        "-"
      ]
    };
  }

  if (!profile.customCommand) {
    throw new Error("custom provider 需要配置 customCommand");
  }

  return {
    command: profile.customCommand,
    args: profile.customArgs ?? []
  };
}

function writePrompt(child: ChildProcessWithoutNullStreams, prompt: string): void {
  child.stdin.write(prompt);
  child.stdin.end();
}

function killAfterTimeout(
  child: ChildProcessWithoutNullStreams,
  profile: ProxyProfile,
  spec: CommandSpec,
  context?: ProviderRunContext
): TimeoutHandle {
  if (profile.timeoutMs <= 0) {
    return {
      timedOut: () => false
    };
  }

  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    emitProviderEvent(context, {
      stage: "provider_timeout",
      provider: profile.provider,
      command: spec.command,
      timeoutMs: profile.timeoutMs
    });
    child.kill("SIGTERM");
  }, profile.timeoutMs);
  return {
    timer,
    timedOut: () => didTimeout
  };
}

function logSpawn(
  profile: ProxyProfile,
  spec: CommandSpec,
  prompt: string,
  streaming: boolean,
  context?: ProviderRunContext
): void {
  emitProviderEvent(context, {
    stage: "provider_spawn",
    provider: profile.provider,
    command: spec.command,
    args: spec.args,
    cwd: profile.projectDir,
    streaming,
    promptChars: prompt.length
  });
}

export function createCliProvider(): AiProviderAdapter {
  return {
    async generateText(profile, prompt, context) {
      const spec = createProviderCommand(profile, false);
      return runCommandToText(spec, profile, prompt, context);
    },
    streamText(profile, prompt, context) {
      const spec = createProviderCommand(profile, true);
      return runCommandToStream(spec, profile, prompt, context);
    }
  };
}

export function createDefaultProviders(): Required<ProviderRegistry> {
  const cliProvider = createCliProvider();
  return {
    claude: cliProvider,
    codex: cliProvider,
    custom: cliProvider
  };
}

async function runCommandToText(
  spec: CommandSpec,
  profile: ProxyProfile,
  prompt: string,
  context?: ProviderRunContext
): Promise<string> {
  logSpawn(profile, spec, prompt, false, context);
  const child = spawn(spec.command, spec.args, {
    cwd: profile.projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  }) as ChildProcessWithoutNullStreams;
  const timeout = killAfterTimeout(child, profile, spec, context);
  writePrompt(child, prompt);

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
    emitProviderEvent(context, {
      stage: "provider_stdout",
      provider: profile.provider,
      bytes: chunk.length
    });
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
    emitProviderEvent(context, {
      stage: "provider_stderr",
      provider: profile.provider,
      bytes: chunk.length,
      text: chunk.toString("utf8").slice(0, 1000)
    });
  });

  const exit = await new Promise<ProcessExit>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    if (timeout.timer) {
      clearTimeout(timeout.timer);
    }
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
  emitProviderEvent(context, {
    stage: "provider_exit",
    provider: profile.provider,
    code: exit.code,
    signal: exit.signal,
    timedOut: timeout.timedOut(),
    stdoutChars: stdout.length,
    stderrChars: stderr.length
  });
  if (timeout.timedOut()) {
    throw new Error(`${spec.command} 超时 ${profile.timeoutMs}ms 后终止`);
  }
  if (exit.code !== 0) {
    throw new Error(stderr || `${spec.command} 退出码 ${exit.code ?? "unknown"}`);
  }

  const parsed = stdout
    .split(/\r?\n/)
    .map((line) => extractTextFromProviderLine(line))
    .join("")
    .trim();
  return parsed || stdout.trim();
}

async function* runCommandToStream(
  spec: CommandSpec,
  profile: ProxyProfile,
  prompt: string,
  context?: ProviderRunContext
): AsyncIterable<string> {
  logSpawn(profile, spec, prompt, true, context);
  const child = spawn(spec.command, spec.args, {
    cwd: profile.projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  }) as ChildProcessWithoutNullStreams;
  const timeout = killAfterTimeout(child, profile, spec, context);
  const stderrChunks: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
    emitProviderEvent(context, {
      stage: "provider_stderr",
      provider: profile.provider,
      bytes: chunk.length,
      text: chunk.toString("utf8").slice(0, 1000)
    });
  });
  writePrompt(child, prompt);

  const lines = createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  try {
    for await (const line of lines) {
      emitProviderEvent(context, {
        stage: "provider_stdout_line",
        provider: profile.provider,
        lineChars: line.length,
        text: line.slice(0, 1000)
      });
      const text = extractTextFromProviderLine(line, { streaming: true });
      if (text) {
        yield text;
      }
    }
  } finally {
    lines.close();
  }

  const exit = await new Promise<ProcessExit>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    if (timeout.timer) {
      clearTimeout(timeout.timer);
    }
  });

  const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
  emitProviderEvent(context, {
    stage: "provider_exit",
    provider: profile.provider,
    code: exit.code,
    signal: exit.signal,
    timedOut: timeout.timedOut(),
    stderrChars: stderr.length
  });
  if (timeout.timedOut()) {
    throw new Error(`${spec.command} 超时 ${profile.timeoutMs}ms 后终止`);
  }
  if (exit.code !== 0) {
    throw new Error(stderr || `${spec.command} 退出码 ${exit.code ?? "unknown"}`);
  }
}
