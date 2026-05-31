import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { AppConfig, RequestDiagnosticSummary } from "@proxy2localai/shared";
import { getBridgeHealth, getRecentDiagnostics, type BridgeHealth } from "../lib/bridgeApi";
import { requestProfilePermission } from "../lib/permissions";
import { getChromeConfigStorage } from "../lib/storage";
import { syncBridgeThenApplyRules } from "../lib/sync";
import { Button, Panel, Pill, StatusDot, ToggleSwitch } from "../ui/components";
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
    <main className="w-[390px] max-w-[calc(100vw-36px)] bg-console-bg p-3 text-console-text">
      <section className="grid gap-3">
        <Panel className="grid gap-3 shadow-console">
          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-console-strong">Proxy2LocalAI</h1>
              <p className="mt-1 truncate text-xs text-console-subtle" aria-live="polite">{status}</p>
            </div>
            <Pill tone={view.bridgeState === "online" ? "success" : "danger"}>
              {view.bridgeState === "online" ? "就绪" : "离线"}
            </Pill>
          </header>

          <div className="grid grid-cols-3 gap-2">
            <article className="grid gap-1 rounded-console-sm border border-console-border bg-console-muted p-2">
              <span className="text-[11px] text-console-subtle">配置</span>
              <strong className="text-base text-console-strong">{view.profileCount}</strong>
            </article>
            <article className="grid gap-1 rounded-console-sm border border-console-border bg-console-muted p-2">
              <span className="text-[11px] text-console-subtle">启用</span>
              <strong className="text-base text-console-strong">{view.enabledProfileCount}</strong>
            </article>
            <article className="grid gap-1 rounded-console-sm border border-console-border bg-console-muted p-2">
              <span className="text-[11px] text-console-subtle">失败</span>
              <strong className="text-base text-console-strong">{view.recentFailure ? 1 : 0}</strong>
            </article>
          </div>

          <section className={view.bridgeState === "online" ? "grid gap-1 rounded-console border border-[rgba(22,130,85,0.28)] bg-console-success-soft p-3" : "grid gap-1 rounded-console border border-[rgba(184,50,50,0.28)] bg-console-danger-soft p-3"}>
            <div className="flex items-center gap-2">
              <StatusDot tone={view.bridgeState === "online" ? "success" : "danger"} />
              <strong className="text-sm text-console-strong">{view.bridgeLabel}</strong>
            </div>
            {view.bridgeState === "offline" && <p className="text-xs leading-5 text-console-subtle">请先启动本地 Bridge，或打开完整配置检查地址和 Token。</p>}
          </section>

          {view.recentFailure && (
            <section className="grid gap-1 rounded-console border border-[rgba(166,101,0,0.3)] bg-console-warning-soft p-3">
              <strong className="text-sm text-console-strong">最近失败</strong>
              <p className="truncate text-xs text-console-subtle" title={view.recentFailure.targetUrl}>{view.recentFailure.stageLabel}</p>
            </section>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" icon={<RefreshCw size={15} aria-hidden="true" />} onClick={() => void sync().catch((error) => setStatus(error instanceof Error ? error.message : "同步失败"))}>
              同步
            </Button>
            <Button type="button" icon={<ExternalLink size={15} aria-hidden="true" />} onClick={() => chrome.runtime.openOptionsPage()}>
              控制台
            </Button>
          </div>
        </Panel>

        <Panel className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm text-console-strong">快捷启停</strong>
            {view.hasMoreProfiles && <Pill>{view.profileCount} 个</Pill>}
          </div>
          {view.visibleProfiles.length === 0 ? (
            <p className="text-sm leading-6 text-console-subtle">暂无 Profile，可打开控制台创建第一个代理。</p>
          ) : (
            <ul className="grid gap-2 p-0">
              {view.visibleProfiles.map((profile) => (
                <li key={profile.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-console-border pt-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-console-text">{profile.name}</span>
                    <small className="block truncate text-xs text-console-subtle">{profile.enabled ? "启用" : "停用"} · {profile.responseMode}</small>
                  </div>
                  <ToggleSwitch
                    checked={profile.enabled}
                    aria-label={profile.switchLabel}
                    onClick={() => void toggleProfile(profile.id).catch((error) => setStatus(error instanceof Error ? error.message : "切换失败"))}
                  >
                    {profile.switchLabel}
                  </ToggleSwitch>
                </li>
              ))}
            </ul>
          )}
          {view.hasMoreProfiles && (
            <Button type="button" variant="secondary" fullWidth onClick={() => chrome.runtime.openOptionsPage()}>
              查看更多
            </Button>
          )}
        </Panel>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
