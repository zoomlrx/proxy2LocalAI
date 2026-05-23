import React from "react";
import type { BridgeDoctorReport } from "../../lib/bridgeApi";

interface BridgeStatusBarProps {
  status: string;
  health: { version?: string; protocolVersion?: number } | null;
  doctorReport: BridgeDoctorReport | null;
  onTestBridge: () => void;
  onRunDoctor: () => void;
  onSync: () => void;
}

export function BridgeStatusBar({ status, health, doctorReport, onTestBridge, onRunDoctor, onSync }: BridgeStatusBarProps) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>
            Proxy2LocalAI
            {health?.version && (
              <small className="version-badge">
                v{health.version}
                {health.protocolVersion !== undefined && ` (proto v${health.protocolVersion})`}
              </small>
            )}
          </h1>
          <p>{status}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={onTestBridge}>测试 Bridge</button>
          <button type="button" onClick={onRunDoctor}>自检 Bridge</button>
          <button type="button" onClick={onSync}>同步</button>
        </div>
      </header>

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
