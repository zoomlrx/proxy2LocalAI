import type { ProxyProfile } from "@proxy2localai/shared";

export interface ProfileSummaryItem {
  label: string;
  value: string;
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
}

export function buildProfileInspectorView(profile: ProxyProfile | null | undefined): ProfileInspectorView {
  if (!profile) {
    return {
      hasSelection: false,
      title: "所选规则",
      subtitle: "尚未选择 Profile",
      statusLabel: "未启用",
      statusTone: "default",
      editLabel: "新建代理",
      drawerTitle: "配置详情",
      summary: []
    };
  }

  return {
    hasSelection: true,
    title: profile.name,
    subtitle: profile.id,
    statusLabel: profile.enabled ? "启用" : "停用",
    statusTone: profile.enabled ? "success" : "default",
    editLabel: "打开详情",
    drawerTitle: `编辑规则：${profile.name}`,
    summary: [
      { label: "命中条件", value: `${profile.methods.join(",")} ${profile.targetPath}` },
      { label: "Provider", value: profile.provider },
      { label: "响应协议", value: profile.responseMode },
      { label: "项目路径", value: profile.projectDir || "-" }
    ]
  };
}
