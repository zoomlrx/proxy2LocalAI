import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { platform } from "node:os";
import { spawnSync } from "node:child_process";
import type { AiProvider, ProxyProfile } from "@proxy2localai/shared";

export type DoctorCheckStatus = "ok" | "warning" | "error";

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface CommandResolution {
  ok: boolean;
  path?: string;
  message?: string;
}

export interface DoctorReport {
  ok: boolean;
  service: "proxy2localai-bridge";
  generatedAt: string;
  summary: {
    port: number;
    profileCount: number;
    enabledProfileCount: number;
  };
  checks: DoctorCheck[];
}

export interface CreateDoctorReportOptions {
  port: number;
  tokenSource: string;
  profilesPath: string;
  requestsLogPath: string;
  profiles: ProxyProfile[];
  commandExists?: (command: string) => CommandResolution;
  canWriteDataPath?: (path: string) => boolean;
  now?: () => Date;
}

const PROVIDER_COMMANDS: Record<Exclude<AiProvider, "custom">, string> = {
  claude: "claude",
  codex: "codex"
};

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function requiredCommandsForProfiles(profiles: ProxyProfile[]): string[] {
  return uniqueValues(profiles
    .filter((profile) => profile.enabled)
    .map((profile) => {
      if (profile.provider === "custom") {
        return profile.customCommand?.trim() ?? "";
      }
      return PROVIDER_COMMANDS[profile.provider];
    })
    .filter(Boolean));
}

function createCheck(
  id: string,
  label: string,
  status: DoctorCheckStatus,
  message: string,
  details?: Record<string, unknown>
): DoctorCheck {
  return details ? { id, label, status, message, details } : { id, label, status, message };
}

export function createDoctorReport(options: CreateDoctorReportOptions): DoctorReport {
  const enabledProfiles = options.profiles.filter((profile) => profile.enabled);
  const commandExists = options.commandExists ?? resolveCommand;
  const canWriteDataPath = options.canWriteDataPath ?? canWriteDirectoryForFile;
  const checks: DoctorCheck[] = [
    createCheck(
      "bridge",
      "Bridge 服务",
      "ok",
      `Bridge 已在 127.0.0.1:${options.port} 响应`,
      { tokenSource: options.tokenSource }
    )
  ];

  const usesDefaultToken = options.tokenSource === "default local token";
  checks.push(createCheck(
    "token",
    "本地 Token",
    usesDefaultToken ? "warning" : "ok",
    usesDefaultToken
      ? "当前使用内置默认 token，建议设置 PROXY2LOCALAI_TOKEN"
      : `当前 token 来源：${options.tokenSource}`
  ));

  checks.push(options.profiles.length > 0
    ? createCheck(
        "profiles",
        "代理配置",
        "ok",
        `已加载 ${options.profiles.length} 套配置，其中 ${enabledProfiles.length} 套已启用`
      )
    : createCheck(
        "profiles",
        "代理配置",
        "warning",
        "当前还没有代理配置，请在扩展配置页导入或新增配置"
      ));

  const storageOk = canWriteDataPath(options.profilesPath) && canWriteDataPath(options.requestsLogPath);
  checks.push(createCheck(
    "storage",
    "数据目录",
    storageOk ? "ok" : "error",
    storageOk ? "配置和日志目录可写" : "配置或日志目录不可写",
    {
      profilesPath: options.profilesPath,
      requestsLogPath: options.requestsLogPath
    }
  ));

  for (const command of requiredCommandsForProfiles(options.profiles)) {
    const resolved = commandExists(command);
    checks.push(createCheck(
      `provider:${command}`,
      `Provider 命令: ${command}`,
      resolved.ok ? "ok" : "error",
      resolved.ok ? `已找到 ${command}` : `未找到 ${command}，请确认已安装并加入 PATH`,
      resolved.path || resolved.message ? {
        path: resolved.path,
        message: resolved.message
      } : undefined
    ));
  }

  return {
    ok: checks.every((check) => check.status !== "error"),
    service: "proxy2localai-bridge",
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    summary: {
      port: options.port,
      profileCount: options.profiles.length,
      enabledProfileCount: enabledProfiles.length
    },
    checks
  };
}

function canWriteDirectoryForFile(path: string): boolean {
  try {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function resolveCommand(command: string): CommandResolution {
  const trimmed = command.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: "命令为空"
    };
  }

  const result = platform() === "win32"
    ? spawnSync("where.exe", [trimmed], { encoding: "utf8", windowsHide: true })
    : spawnSync("sh", ["-lc", `command -v ${shellQuote(trimmed)}`], { encoding: "utf8" });

  if (result.status === 0) {
    return {
      ok: true,
      path: result.stdout.trim().split(/\r?\n/)[0]
    };
  }

  return {
    ok: false,
    message: (result.stderr || result.stdout || "").trim() || `无法解析命令 ${trimmed}`
  };
}
