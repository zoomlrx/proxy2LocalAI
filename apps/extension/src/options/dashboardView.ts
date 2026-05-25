import type { AppConfig, RequestDiagnosticSummary } from "@proxy2localai/shared";

interface DashboardHealth {
  ok: boolean;
  version?: string;
  protocolVersion?: number;
}

export interface DashboardStatus {
  bridgeState: "online" | "offline";
  bridgeLabel: string;
  bridgeVersionLabel: string;
  profileCount: number;
  enabledProfileCount: number;
  failedRequestCount: number;
}

const STAGE_LABELS: Record<string, string> = {
  request_received: "Bridge 已接收",
  profile_matched: "Profile 匹配",
  profile_not_found: "未匹配 Profile",
  dnr_not_matched: "DNR 未命中",
  cors_preflight: "CORS 预检",
  cors_preflight_failed: "CORS 预检失败",
  provider_spawn: "Provider 启动",
  provider_first_output: "Provider 首次输出",
  provider_done: "Provider 完成",
  provider_no_output: "Provider 无输出",
  provider_error: "Provider 执行错误",
  provider_timeout: "Provider 超时",
  response_mapped: "响应映射",
  response_done: "响应返回",
  response_transform_failed: "响应转换失败",
  client_aborted: "客户端中断"
};

export function getFailedRequestCount(items: RequestDiagnosticSummary[]): number {
  return items.filter((item) => item.finalStatus === "error").length;
}

export function getDiagnosticStageLabel(stage?: string): string {
  if (!stage) {
    return "-";
  }
  return STAGE_LABELS[stage] ?? stage;
}

export function formatDurationForDisplay(ms?: number): string {
  if (ms === undefined) {
    return "-";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function buildDashboardStatus(
  config: AppConfig,
  health: DashboardHealth | null,
  diagnostics: RequestDiagnosticSummary[]
): DashboardStatus {
  const bridgeState = health?.ok ? "online" : "offline";
  const version = health?.version ? `v${health.version}` : "";
  const protocol = health?.protocolVersion !== undefined ? `proto v${health.protocolVersion}` : "";

  return {
    bridgeState,
    bridgeLabel: bridgeState === "online" ? "Bridge 在线" : "Bridge 离线",
    bridgeVersionLabel: [version, protocol].filter(Boolean).join(" · "),
    profileCount: config.profiles.length,
    enabledProfileCount: config.profiles.filter((profile) => profile.enabled).length,
    failedRequestCount: getFailedRequestCount(diagnostics)
  };
}
