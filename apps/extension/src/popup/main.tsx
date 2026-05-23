import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppConfig } from "@proxy2localai/shared";
import { getBridgeHealth, type BridgeHealth } from "../lib/bridgeApi";
import { getChromeConfigStorage } from "../lib/storage";
import { syncBridgeThenApplyRules } from "../lib/sync";
import "../ui.css";

function PopupApp() {
  const storage = useMemo(() => getChromeConfigStorage(), []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState("加载中");
  const [health, setHealth] = useState<BridgeHealth | null>(null);

  const refresh = useCallback(async () => {
    const loaded = await storage.load();
    setConfig(loaded);
    try {
      const result = await getBridgeHealth(loaded);
      setHealth(result);
      setStatus(result.ok ? `Bridge 在线 v${result.version ?? ""}` : "Bridge 状态异常");
    } catch {
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

  return (
    <main className="popup">
      <header>
        <h1>Proxy2LocalAI</h1>
        <p>{status}</p>
      </header>
      <dl>
        <div>
          <dt>配置</dt>
          <dd>{config?.profiles.length ?? 0}</dd>
        </div>
        <div>
          <dt>启用</dt>
          <dd>{config?.profiles.filter((profile) => profile.enabled).length ?? 0}</dd>
        </div>
      </dl>
      <div className="actions">
        <button type="button" onClick={() => void sync().catch((error) => setStatus(error instanceof Error ? error.message : "同步失败"))}>
          同步
        </button>
        <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          配置
        </button>
      </div>
      <ul>
        {config?.profiles.slice(0, 4).map((profile) => (
          <li key={profile.id}>
            <div className="profile-item-row">
              <div>
                <span>{profile.name}</span>
                <small>{profile.enabled ? "启用" : "停用"} · {profile.responseMode}</small>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                启停
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
