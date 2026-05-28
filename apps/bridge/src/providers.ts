import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { getDefaultStreamCodec, type AiProvider, type NormalizedStreamEvent, type ProxyProfile } from "@proxy2localai/shared";
import { createClaudeCodeStreamCodec, type StreamCodec } from "./streamCodecs/claudeCode";
import { createCodexCliStreamCodec } from "./streamCodecs/codexCli";

export interface AiProviderAdapter {
  generateText(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): Promise<string>;
  generateRawText(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): Promise<string>;
  streamText(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): AsyncIterable<string>;
  streamEvents?(profile: ProxyProfile, prompt: string, context?: ProviderRunContext): AsyncIterable<ProviderStreamEvent>;
}

export type ProviderRegistry = Partial<Record<AiProvider, AiProviderAdapter>>;
export type ProviderLogger = (event: Record<string, unknown>) => void;

export interface ProviderRunContext {
  onEvent?: (event: Record<string, unknown>) => void;
}

export interface LegacyProviderStreamEvent {
  source: string;
  content: string;
}

export type ProviderStreamEvent = NormalizedStreamEvent | LegacyProviderStreamEvent;

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface ProviderCommandOptions {
  allowDangerousCli?: boolean;
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

function cleanSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
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

export function extractProviderStreamEventFromLine(line: string): LegacyProviderStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return extractProviderStreamEvent(JSON.parse(trimmed) as unknown);
  } catch {
    return {
      source: "message",
      content: line
    };
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

  return extractProviderStreamEvent(value)?.content ?? "";
}

function extractProviderStreamEvent(value: unknown): LegacyProviderStreamEvent | null {
  if (typeof value === "string") {
    return {
      source: "message",
      content: value
    };
  }
  if (Array.isArray(value)) {
    const content = value.map((item) => extractProviderStreamEvent(item)?.content ?? "").join("");
    return content ? { source: "message", content } : null;
  }
  if (!isRecord(value)) {
    return null;
  }

  if (value.type === "stream_event") {
    return extractClaudeStreamEvent(value.event);
  }
  if (value.type === "assistant") {
    const content = extractClaudeAssistantText(value.message);
    return content ? { source: "message", content } : null;
  }

  const source = inferProviderEventSource(value);
  const content = extractProviderEventContent(value);
  return content ? { source, content } : null;
}

function extractClaudeStreamEventText(event: unknown): string {
  return extractClaudeStreamEvent(event)?.content ?? "";
}

function extractClaudeStreamEvent(event: unknown): LegacyProviderStreamEvent | null {
  if (!isRecord(event)) {
    return null;
  }
  if (event.type !== "content_block_delta" || !isRecord(event.delta)) {
    const content = extractProviderEventContent(event);
    return content ? { source: inferProviderEventSource(event), content } : null;
  }
  if (event.delta.type === "text_delta" && typeof event.delta.text === "string") {
    return {
      source: "message",
      content: event.delta.text
    };
  }
  if ((event.delta.type === "thinking_delta" || event.delta.type === "reasoning_delta")) {
    const content = extractProviderEventContent(event.delta);
    return content ? { source: "reasoning", content } : null;
  }
  return null;
}

function inferProviderEventSource(record: Record<string, unknown>): string {
  for (const key of ["event", "type", "subtype", "kind", "name"]) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("reasoning") || normalized.includes("thinking") || normalized.includes("thought")) {
      return "reasoning";
    }
    if (normalized.includes("message") || normalized.includes("assistant") || normalized.includes("content") || normalized.includes("text") || normalized.includes("result")) {
      return "message";
    }
    return normalized;
  }
  return "message";
}

function extractProviderEventContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractProviderEventContent).join("");
  }
  if (!isRecord(value)) {
    return "";
  }

  for (const key of ["result", "text", "content", "delta", "message", "data", "thinking", "reasoning"]) {
    const extracted = extractProviderEventContent(value[key]);
    if (extracted) {
      return extracted;
    }
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

export function isDangerousCliAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.PROXY2LOCALAI_ALLOW_DANGEROUS_CLI ?? env.web2LocalAgent_ALLOW_DANGEROUS_CLI ?? "";
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function createProviderCommand(
  profile: ProxyProfile,
  streaming: boolean,
  options: ProviderCommandOptions = {}
): CommandSpec {
  const allowDangerousCli = options.allowDangerousCli ?? (profile.allowDangerousCli || isDangerousCliAllowed());
  if (profile.provider === "claude") {
    const providerArgs = allowDangerousCli ? profile.providerArgs ?? [] : [];
    const args = [
      "-p",
      "--output-format",
      streaming ? "stream-json" : "json",
      ...(streaming ? ["--verbose", "--include-partial-messages"] : [])
    ];
    if (allowDangerousCli) {
      args.push("--dangerously-skip-permissions", "--permission-mode", "bypassPermissions");
    }
    const mergedArgs = appendArgs(args, providerArgs, ["--dangerously-skip-permissions"]);
    if (!providerArgs.includes("--tools")) {
      mergedArgs.push("--tools", "");
    }
    return {
      command: "claude",
      args: mergedArgs
    };
  }

  if (profile.provider === "codex") {
    const args = [
      "exec",
      "--skip-git-repo-check",
      ...(allowDangerousCli ? ["--full-auto"] : []),
      "--json",
      "-C",
      profile.projectDir
    ];
    const mergedArgs = appendArgs(args, allowDangerousCli ? profile.providerArgs : undefined, ["--full-auto"]);
    mergedArgs.push("-");
    return {
      command: "codex",
      args: mergedArgs
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

function appendArgs(args: string[], extraArgs: string[] | undefined, duplicateBooleanFlags: string[] = []): string[] {
  if (!extraArgs?.length) {
    return args;
  }
  const next = [...args];
  for (const arg of extraArgs) {
    if (duplicateBooleanFlags.includes(arg) && next.includes(arg)) {
      continue;
    }
    next.push(arg);
  }
  return next;
}

export function createCliProvider(): AiProviderAdapter {
  return {
    async generateText(profile, prompt, context) {
      const spec = createProviderCommand(profile, false);
      return runCommandToText(spec, profile, prompt, context);
    },
    async generateRawText(profile, prompt, context) {
      const spec = createProviderCommand(profile, true);
      return runCommandToRawText(spec, profile, prompt, context);
    },
    streamText(profile, prompt, context) {
      const spec = createProviderCommand(profile, true);
      return runCommandToStream(spec, profile, prompt, context);
    },
    streamEvents(profile, prompt, context) {
      const spec = createProviderCommand(profile, true);
      return runCommandToStreamEvents(spec, profile, prompt, context);
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
    windowsHide: true,
    env: cleanSpawnEnv()
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
    windowsHide: true,
    env: cleanSpawnEnv()
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

  let accumulatedText = "";

  try {
    for await (const line of lines) {
      emitProviderEvent(context, {
        stage: "provider_stdout_line",
        provider: profile.provider,
        lineChars: line.length,
        text: line.slice(0, 1000)
      });
      const text = extractTextFromProviderLine(line, { streaming: true });
      if (!text) continue;

      // 去重：跳过已累积文本的后缀（assistant 快照 / result 汇总）
      if (accumulatedText.endsWith(text)) continue;
      // 去重：新文本以已累积文本为前缀时，只输出增量后缀
      if (accumulatedText && text.startsWith(accumulatedText)) {
        const suffix = text.slice(accumulatedText.length);
        accumulatedText = text;
        yield suffix;
        continue;
      }

      accumulatedText += text;
      yield text;
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

async function* runCommandToStreamEvents(
  spec: CommandSpec,
  profile: ProxyProfile,
  prompt: string,
  context?: ProviderRunContext
): AsyncIterable<ProviderStreamEvent> {
  logSpawn(profile, spec, prompt, true, context);
  const child = spawn(spec.command, spec.args, {
    cwd: profile.projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: cleanSpawnEnv()
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
  const codec = createStreamCodec(profile);

  try {
    for await (const line of lines) {
      emitProviderEvent(context, {
        stage: "provider_stdout_line",
        provider: profile.provider,
        lineChars: line.length,
        text: line.slice(0, 1000)
      });
      const events = codec.decodeLine(line);
      for (const event of events) {
        yield event;
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

function createStreamCodec(profile: ProxyProfile): StreamCodec {
  const codecId = profile.streamCodec ?? getDefaultStreamCodec(profile.provider);
  if (codecId === "claude-code-v1") {
    return createClaudeCodeStreamCodec();
  }
  if (codecId === "codex-cli-v1") {
    return createCodexCliStreamCodec();
  }
  return createCustomJsonlStreamCodec(profile.provider);
}

function createCustomJsonlStreamCodec(provider: AiProvider): StreamCodec {
  let sequence = 0;
  return {
    decodeLine(line: string): NormalizedStreamEvent[] {
      const legacy = extractProviderStreamEventFromLine(line);
      if (!legacy) {
        return [];
      }
      sequence += 1;
      return [{
        provider: provider === "claude" || provider === "codex" ? provider : "custom",
        eventId: `evt_${String(sequence).padStart(6, "0")}`,
        sequence,
        kind: "delta",
        channel: legacy.source === "reasoning" ? "reasoning" : legacy.source === "debug" ? "debug" : legacy.source === "status" ? "status" : "message",
        content: legacy.content,
        meta: { providerEventType: legacy.source }
      }];
    }
  };
}

async function runCommandToRawText(
  spec: CommandSpec,
  profile: ProxyProfile,
  prompt: string,
  context?: ProviderRunContext
): Promise<string> {
  logSpawn(profile, spec, prompt, true, context);
  const child = spawn(spec.command, spec.args, {
    cwd: profile.projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: cleanSpawnEnv()
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
  return stdout;
}
