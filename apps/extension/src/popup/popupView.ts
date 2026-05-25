import type { AppConfig, RequestDiagnosticSummary } from "@proxy2localai/shared";
import type { BridgeHealth } from "../lib/bridgeApi";
import { getDiagnosticStageLabel } from "../options/dashboardView";

export interface PopupProfileItem {
  id: string;
  name: string;
  enabled: boolean;
  responseMode: string;
  switchLabel: string;
}

export interface PopupViewModel {
  bridgeState: "online" | "offline";
  bridgeLabel: string;
  profileCount: number;
  enabledProfileCount: number;
  visibleProfiles: PopupProfileItem[];
  hasMoreProfiles: boolean;
  recentFailure: {
    id: string;
    targetUrl: string;
    stage: string;
    stageLabel: string;
  } | null;
}

export function buildPopupViewModel(
  config: AppConfig | null,
  health: BridgeHealth | null,
  diagnostics: RequestDiagnosticSummary[],
  profileLimit = 4
): PopupViewModel {
  const profiles = config?.profiles ?? [];
  const recentFailure = diagnostics.find((item) => item.finalStatus === "error") ?? null;

  return {
    bridgeState: health?.ok ? "online" : "offline",
    bridgeLabel: health?.ok ? "Bridge 在线" : "Bridge 未连接",
    profileCount: profiles.length,
    enabledProfileCount: profiles.filter((profile) => profile.enabled).length,
    visibleProfiles: profiles.slice(0, profileLimit).map((profile) => ({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      responseMode: profile.responseMode,
      switchLabel: `${profile.enabled ? "停用" : "启用"} ${profile.name}`
    })),
    hasMoreProfiles: profiles.length > profileLimit,
    recentFailure: recentFailure
      ? {
          id: recentFailure.id,
          targetUrl: recentFailure.targetUrl,
          stage: recentFailure.errorStage ?? "",
          stageLabel: getDiagnosticStageLabel(recentFailure.errorStage)
        }
      : null
  };
}
