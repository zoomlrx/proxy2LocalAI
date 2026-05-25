import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppConfig, RequestDiagnosticSummary } from "@proxy2localai/shared";
import { getBridgeHealth, getRecentDiagnostics, type BridgeHealth } from "../lib/bridgeApi";
import { requestProfilePermission } from "../lib/permissions";
import { getChromeConfigStorage } from "../lib/storage";
import { syncBridgeThenApplyRules } from "../lib/sync";
import { toggleProfileEnabledTransaction } from "./popupActions";
import { buildPopupViewModel } from "./popupView";
import "../ui.css";

function PopupApp() {
  const storage = useMemo(() => getChromeConfigStorage(), []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState("加载中");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [diagnostics, setDiagnostics] = useState<RequestDiagnosticSummary[]>([]);

  const refresh = useCallback(async () => {
    const loaded = await storage.load();
    setConfig(loaded);
    try {
      const result = await getBridgeHealth(loaded);
      setHealth(result);
      setStatus(result.ok ? `Bridge 在线 v${result.version ?? ""}` : "Bridge 状态异常");
      if (result.ok) {
        try {
          const recent = await getRecentDiagnostics(loaded);
          setDiagnostics(recent.items);
        } catch {
          setDiagnostics([]);
        }
      }
    } catch {
      setHealth(null);
      setDiagnostics([]);
      setStatus("Bridge 未连接");
    }
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sync = useCallback(async () => {
    if (!config) {
      return;
    }
    await syncBridgeThenApplyRules(config);
    setStatus("已同步");
  }, [config]);

  const toggleProfile = useCallback(async (profileId: string) => {
    if (!config) {
      return;
    }
    const result = await toggleProfileEnabledTransaction(config, profileId, {
      requestPermission: requestProfilePermission,
      sync: syncBridgeThenApplyRules,
      save: storage.save
    });
    setConfig(result.config);
    setStatus(result.message);
  }, [config, storage]);

  const view = useMemo(() => buildPopupViewModel(config, health, diagnostics), [config, diagnostics, health]);

  return (
    <main className="popup">
      <header>
        <h1>Proxy2LocalAI</h1>
        <p aria-live="polite">{status}</p>
      </header>
      <dl>
        <div>
          <dt>配置</dt>
          <dd>{view.profileCount}</dd>
        </div>
        <div>
          <dt>启用</dt>
          <dd>{view.enabledProfileCount}</dd>
        </div>
      </dl>
      <section className={`popup-bridge ${view.bridgeState}`}>
        <strong>{view.bridgeLabel}</strong>
        {view.bridgeState === "offline" && <p>请先启动本地 Bridge，或打开完整配置检查地址和 Token。</p>}
      </section>
      {view.recentFailure && (
        <section className="popup-failure">
          <strong>最近失败</strong>
          <p>{view.recentFailure.stageLabel}</p>
        </section>
      )}
      <div className="actions">
        <button type="button" onClick={() => void sync().catch((error) => setStatus(error instanceof Error ? error.message : "同步失败"))}>
          同步
        </button>
        <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          配置
        </button>
      </div>
      <ul>
        {view.visibleProfiles.map((profile) => (
          <li key={profile.id}>
            <div className="profile-item-row">
              <div>
                <span>{profile.name}</span>
                <small>{profile.enabled ? "启用" : "停用"} · {profile.responseMode}</small>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => void toggleProfile(profile.id).catch((error) => setStatus(error instanceof Error ? error.message : "切换失败"))}
              >
                {profile.enabled ? "停用" : "启用"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {view.hasMoreProfiles && (
        <button type="button" className="secondary full-width" onClick={() => chrome.runtime.openOptionsPage()}>
          查看更多
        </button>
      )}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
