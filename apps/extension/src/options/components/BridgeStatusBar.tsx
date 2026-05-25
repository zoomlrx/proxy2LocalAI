import React from "react";
import type { BridgeDoctorReport } from "../../lib/bridgeApi";
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
  return (
    <>
      <header className="topbar">
        <div>
          <h1>
            Proxy2LocalAI
            {dashboard.bridgeVersionLabel && (
              <small className="version-badge">
                {dashboard.bridgeVersionLabel}
              </small>
            )}
          </h1>
          <p aria-live="polite">{status}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={onTestBridge}>测试 Bridge</button>
          <button type="button" onClick={onRunDoctor}>自检 Bridge</button>
          <button type="button" onClick={onSync}>同步</button>
          <button type="button" className="secondary" onClick={onOpenConfigTools}>导入导出</button>
          <button type="button" className="secondary" onClick={onOpenBridgeSettings}>设置</button>
        </div>
      </header>

      <section className="status-strip" aria-label="代理控制台状态">
        <div className={`status-tile ${dashboard.bridgeState}`}>
          <span>Bridge</span>
          <strong>{dashboard.bridgeLabel}</strong>
        </div>
        <div className="status-tile">
          <span>同步状态</span>
          <strong>{status}</strong>
        </div>
        <div className="status-tile">
          <span>启用 Profile</span>
          <strong>{dashboard.enabledProfileCount}/{dashboard.profileCount}</strong>
        </div>
        <div className={dashboard.failedRequestCount > 0 ? "status-tile error" : "status-tile ok"}>
          <span>最近失败</span>
          <strong>{dashboard.failedRequestCount}</strong>
        </div>
      </section>

      {doctorReport && (
        <section className="doctor-panel">
          <div className="doctor-title">
            <strong>Bridge 自检</strong>
            <small>{doctorReport.service} · {doctorReport.summary.enabledProfileCount}/{doctorReport.summary.profileCount} 启用</small>
          </div>
          <ul>
            {doctorReport.checks.map((check) => (
              <li key={check.id} className={`doctor-check ${check.status}`}>
                <span>{check.label}</span>
                <small>{check.message}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
