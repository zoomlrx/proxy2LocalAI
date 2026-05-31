import React from "react";
import { Download, HeartPulse, RotateCw, Settings, Stethoscope } from "lucide-react";
import type { BridgeDoctorReport } from "../../lib/bridgeApi";
import { Button, Panel, Pill, StatusDot } from "../../ui/components";
import type { DashboardStatus } from "../dashboardView";

interface BridgeStatusBarProps {
  status: string;
  dashboard: DashboardStatus;
  doctorReport: BridgeDoctorReport | null;
  onTestBridge: () => void;
  onRunDoctor: () => void;
  onSync: () => void;
  onOpenBridgeSettings: () => void;
  onOpenConfigTools: () => void;
}

export function BridgeStatusBar({
  status,
  dashboard,
  doctorReport,
  onTestBridge,
  onRunDoctor,
  onSync,
  onOpenBridgeSettings,
  onOpenConfigTools
}: BridgeStatusBarProps) {
  const bridgeTone = dashboard.bridgeState === "online" ? "success" : "danger";

  return (
    <aside className="grid content-start gap-4 lg:sticky lg:top-5">
      <Panel className="grid gap-4">
        <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-[7px] border border-console-primary bg-console-muted font-mono text-sm font-bold text-console-primary shadow-[0_0_18px_oklch(81.1%_0.146_217.7_/_0.22)]">
            P2
          </div>
          <div className="min-w-0">
            <strong className="block truncate text-console-strong">Proxy2LocalAI</strong>
            <span className="text-xs text-console-subtle">{dashboard.bridgeVersionLabel || "local console"}</span>
          </div>
        </div>

        <div className={dashboard.bridgeState === "online"
          ? "grid gap-2 rounded-console-sm border border-console-success bg-console-success-soft p-3"
          : "grid gap-2 rounded-console-sm border border-console-danger bg-console-danger-soft p-3"}
        >
          <div className="flex min-w-0 items-center gap-2">
            <StatusDot tone={bridgeTone} />
            <strong className="truncate text-sm text-console-strong">{dashboard.bridgeLabel}</strong>
          </div>
          <code className="truncate font-mono text-xs text-console-text">{status}</code>
        </div>

        <nav className="grid gap-2" aria-label="控制台快捷操作">
          <Button type="button" variant="secondary" fullWidth icon={<HeartPulse size={16} aria-hidden="true" />} onClick={onTestBridge}>
            测试 Bridge
          </Button>
          <Button type="button" variant="secondary" fullWidth icon={<Stethoscope size={16} aria-hidden="true" />} onClick={onRunDoctor}>
            自检 Bridge
          </Button>
          <Button type="button" variant="secondary" fullWidth icon={<RotateCw size={16} aria-hidden="true" />} onClick={onSync}>
            同步规则
          </Button>
          <Button type="button" variant="ghost" fullWidth icon={<Download size={16} aria-hidden="true" />} onClick={onOpenConfigTools}>
            导入导出
          </Button>
          <Button type="button" variant="ghost" fullWidth icon={<Settings size={16} aria-hidden="true" />} onClick={onOpenBridgeSettings}>
            Bridge 设置
          </Button>
        </nav>
      </Panel>

      <Panel className="grid gap-3 border-dashed bg-console-muted">
        <div className="flex items-center justify-between gap-3">
          <strong className="text-sm text-console-strong">运行摘要</strong>
          <Pill tone={dashboard.failedRequestCount > 0 ? "warning" : "success"}>
            {dashboard.failedRequestCount > 0 ? "需关注" : "正常"}
          </Pill>
        </div>
        <dl className="grid gap-2 text-xs">
          <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2">
            <dt className="font-semibold text-console-subtle">启用代理</dt>
            <dd className="truncate text-console-text">{dashboard.enabledProfileCount}/{dashboard.profileCount}</dd>
          </div>
          <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2">
            <dt className="font-semibold text-console-subtle">最近失败</dt>
            <dd className="truncate text-console-text">{dashboard.failedRequestCount} 次</dd>
          </div>
        </dl>
      </Panel>

      {doctorReport && (
        <Panel className="grid gap-3">
          <div className="grid gap-1">
            <strong className="text-sm text-console-strong">Bridge 自检</strong>
            <span className="text-xs text-console-subtle">
              {doctorReport.service} · {doctorReport.summary.enabledProfileCount}/{doctorReport.summary.profileCount} 启用
            </span>
          </div>
          <ul className="grid gap-2 p-0">
            {doctorReport.checks.map((check) => (
              <li key={check.id} className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2 rounded-console-sm bg-console-muted p-2">
                <StatusDot tone={check.status === "error" ? "danger" : check.status === "warning" ? "warning" : "success"} className="mt-1" />
                <div className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-console-text">{check.label}</span>
                  <small className="block break-anywhere text-xs leading-5 text-console-subtle">{check.message}</small>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </aside>
  );
}
