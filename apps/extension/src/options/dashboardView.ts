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

export type ProxyChainStepId = "dnr" | "bridge" | "profile" | "provider" | "response" | "client";
export type ProxyChainStepState = "ok" | "warning" | "pending";

export interface ProxyChainStep {
  id: ProxyChainStepId;
  label: string;
  state: ProxyChainStepState;
  detail: string;
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

const CHAIN_STEPS: Array<Omit<ProxyChainStep, "state" | "detail">> = [
  { id: "dnr", label: "浏览器规则" },
  { id: "bridge", label: "Bridge" },
  { id: "profile", label: "Profile" },
  { id: "provider", label: "Provider" },
  { id: "response", label: "响应转换" },
  { id: "client", label: "页面消费" }
];

const STAGE_STEP_MAP: Record<string, ProxyChainStepId> = {
  dnr_not_matched: "dnr",
  request_received: "bridge",
  cors_preflight: "bridge",
  cors_preflight_failed: "bridge",
  profile_matched: "profile",
  profile_not_found: "profile",
  provider_spawn: "provider",
  provider_first_output: "provider",
  provider_done: "provider",
  provider_no_output: "provider",
  provider_error: "provider",
  provider_timeout: "provider",
  response_mapped: "response",
  response_done: "response",
  response_transform_failed: "response",
  client_aborted: "client"
};

export function buildProxyChainSteps(
  health: DashboardHealth | null,
  diagnostics: RequestDiagnosticSummary[]
): ProxyChainStep[] {
  const latestFailure = diagnostics.find((item) => item.finalStatus === "error");
  const failureStep = latestFailure?.errorStage ? STAGE_STEP_MAP[latestFailure.errorStage] : undefined;
  const failureIndex = failureStep ? CHAIN_STEPS.findIndex((step) => step.id === failureStep) : -1;

  if (!health?.ok) {
    return CHAIN_STEPS.map((step, index) => ({
      ...step,
      state: index === 1 ? "warning" : index < 1 ? "ok" : "pending",
      detail: index === 1 ? "Bridge 离线" : index < 1 ? "等待请求" : "未验证"
    }));
  }

  return CHAIN_STEPS.map((step, index) => {
    if (!latestFailure || failureIndex < 0) {
      return {
        ...step,
        state: index < 2 ? "ok" : "pending",
        detail: index < 2 ? "正常" : "等待请求"
      };
    }

    if (index < failureIndex) {
      return { ...step, state: "ok", detail: "已通过" };
    }

    if (index === failureIndex) {
      return {
        ...step,
        state: "warning",
        detail: getDiagnosticStageLabel(latestFailure.errorStage)
      };
    }

    return { ...step, state: "pending", detail: "未验证" };
  });
}
