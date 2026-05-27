import {
  DEFAULT_MAPPING_SECURITY_POLICY,
  DEFAULT_TOOL_EVENT_POLICY,
  type MappingSecurityPolicy,
  type ProxyProfile,
  type RequestDiagnosticSummary,
  type ToolEventPolicy
} from "@proxy2localai/shared";
import { formatDurationForDisplay, getDiagnosticStageLabel } from "./dashboardView";

export interface ProfileSummaryItem {
  label: string;
  value: string;
  copyable?: boolean;
}

export interface ProfileMappingStatusItem {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

export interface ProfileSecuritySwitchState {
  id: "redactPreview" | "blockRenderedFrames" | "toolEvents" | "allowRaw" | "allowData" | "toolIo";
  label: string;
  checked: boolean;
  risk: "normal" | "high";
}

export interface ProfileDiagnosticSummaryView {
  latestRequestLabel: string;
  latestFailureLabel: string;
  latestRequest?: RequestDiagnosticSummary;
  latestFailure?: RequestDiagnosticSummary;
}

export interface ProfileInspectorView {
  hasSelection: boolean;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: "default" | "success";
  editLabel: string;
  drawerTitle: string;
  summary: ProfileSummaryItem[];
  mappingStatus: ProfileMappingStatusItem[];
  securitySwitches: ProfileSecuritySwitchState[];
  hasHighRiskEnabled: boolean;
  diagnostics: ProfileDiagnosticSummaryView;
}

export function buildProfileInspectorView(
  profile: ProxyProfile | null | undefined,
  diagnostics: RequestDiagnosticSummary[] = []
): ProfileInspectorView {
  if (!profile) {
    return {
      hasSelection: false,
      title: "所选规则",
      subtitle: "尚未选择 Profile",
      statusLabel: "未启用",
      statusTone: "default",
      editLabel: "新建代理",
      drawerTitle: "配置详情",
      summary: [],
      mappingStatus: [],
      securitySwitches: [],
      hasHighRiskEnabled: false,
      diagnostics: {
        latestRequestLabel: "尚无请求",
        latestFailureLabel: "无"
      }
    };
  }

  const mappingPolicy = profile.mappingSecurityPolicy ?? DEFAULT_MAPPING_SECURITY_POLICY;
  const toolPolicy = profile.toolEventPolicy ?? DEFAULT_TOOL_EVENT_POLICY;
  const mappingRuleCount = profile.streamMappings?.length ?? 0;
  const enabledMappingRuleCount = profile.streamMappings?.filter((rule) => rule.enabled).length ?? 0;
  const profileDiagnostics = diagnostics
    .filter((item) => item.profileId === profile.id)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const latestRequest = profileDiagnostics[0];
  const latestFailure = profileDiagnostics.find((item) => item.finalStatus === "error");
  const securitySwitches = buildSecuritySwitches(mappingPolicy, toolPolicy);

  return {
    hasSelection: true,
    title: profile.name,
    subtitle: profile.id,
    statusLabel: profile.enabled ? "启用" : "停用",
    statusTone: profile.enabled ? "success" : "default",
    editLabel: "打开详情",
    drawerTitle: `编辑规则：${profile.name}`,
    summary: [
      { label: "名称", value: profile.name },
      { label: "Provider", value: profile.provider },
      { label: "响应协议", value: profile.responseMode },
      { label: "项目路径", value: profile.projectDir || "-", copyable: Boolean(profile.projectDir) }
    ],
    mappingStatus: [
      { label: "规则数", value: String(mappingRuleCount), tone: "default" },
      { label: "已启用", value: String(enabledMappingRuleCount), tone: enabledMappingRuleCount > 0 ? "success" : "warning" },
      {
        label: "预览状态",
        value: profile.responseMode === "mapped_sse"
          ? enabledMappingRuleCount > 0 ? "正常" : "无启用规则"
          : "未使用映射",
        tone: profile.responseMode === "mapped_sse" && enabledMappingRuleCount > 0 ? "success" : "default"
      }
    ],
    securitySwitches,
    hasHighRiskEnabled: securitySwitches.some((item) => item.risk === "high" && item.checked),
    diagnostics: {
      latestRequestLabel: latestRequest ? formatDiagnosticSummary(latestRequest) : "尚无请求",
      latestFailureLabel: latestFailure ? getDiagnosticStageLabel(latestFailure.errorStage) : "无",
      latestRequest,
      latestFailure
    }
  };
}

function buildSecuritySwitches(
  mappingPolicy: MappingSecurityPolicy,
  toolPolicy: ToolEventPolicy
): ProfileSecuritySwitchState[] {
  return [
    {
      id: "redactPreview",
      label: "预览脱敏",
      checked: mappingPolicy.redactPreview,
      risk: "normal"
    },
    {
      id: "blockRenderedFrames",
      label: "禁止持久化渲染帧",
      checked: !mappingPolicy.persistRenderedFrames,
      risk: "normal"
    },
    {
      id: "toolEvents",
      label: "输出 tool 事件",
      checked: toolPolicy.enabled,
      risk: "high"
    },
    {
      id: "allowRaw",
      label: "允许 {{raw}}",
      checked: mappingPolicy.allowRaw,
      risk: "high"
    },
    {
      id: "allowData",
      label: "允许 {{data}}",
      checked: mappingPolicy.allowData,
      risk: "high"
    },
    {
      id: "toolIo",
      label: "输出 tool 输入/输出",
      checked: mappingPolicy.allowToolInput
        || mappingPolicy.allowToolOutput
        || toolPolicy.includeInput === "raw"
        || toolPolicy.includeOutput === "raw",
      risk: "high"
    }
  ];
}

function formatDiagnosticSummary(item: RequestDiagnosticSummary): string {
  const duration = formatDurationForDisplay(item.duration);
  const status = item.finalStatus === "ok" ? "成功" : item.finalStatus === "error" ? "失败" : "处理中";
  return duration === "-" ? status : `${status} · ${duration}`;
}
