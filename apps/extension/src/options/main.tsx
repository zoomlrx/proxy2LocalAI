import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createConfigExport,
  parseConfigImport,
  type AppConfig,
  type ConfigExportMode,
  type ProxyProfile,
  type RequestDiagnosticSummary
} from "@proxy2localai/shared";
import { applyDynamicRules } from "../lib/dnr";
import { getBridgeDoctor, getBridgeHealth, testBridgeProvider, type BridgeDoctorReport, type BridgeHealth } from "../lib/bridgeApi";
import { requestProfilePermission } from "../lib/permissions";
import { getChromeConfigStorage } from "../lib/storage";
import { syncBridgeThenApplyRules } from "../lib/sync";
import {
  applyCurlToDraft,
  createBlankProfile,
  draftToProfile,
  profileToDraft,
  upsertProfile,
  type ProfileDraft
} from "./profileForm";
import { BridgeStatusBar } from "./components/BridgeStatusBar";
import { ProfileList } from "./components/ProfileList";
import { ProfileEditor } from "./components/ProfileEditor";
import { CreateProxyWizard } from "./components/CreateProxyWizard";
import { RecentRequestsPanel } from "./components/RecentRequestsPanel";
import { buildDashboardStatus } from "./dashboardView";
import "../ui.css";

function OptionsApp() {
  const storage = useMemo(() => getChromeConfigStorage(), []);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(() => createBlankProfile());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("正在加载配置");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [doctorReport, setDoctorReport] = useState<BridgeDoctorReport | null>(null);
  const [curlText, setCurlText] = useState("");
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bridgeSettingsOpen, setBridgeSettingsOpen] = useState(false);
  const [configToolsOpen, setConfigToolsOpen] = useState(false);
  const [recentDiagnostics, setRecentDiagnostics] = useState<RequestDiagnosticSummary[]>([]);
  const [providerTestResult, setProviderTestResult] = useState<{ ok: boolean; output?: string | null; error?: string } | null>(null);

  const load = useCallback(async () => {
    const loaded = await storage.load();
    setConfig(loaded);
    const firstProfile = loaded.profiles[0];
    if (firstProfile) {
      setSelectedId(firstProfile.id);
      setDraft(profileToDraft(firstProfile));
    }
    try {
      const result = await getBridgeHealth(loaded);
      setHealth(result);
      setStatus("配置已加载");
    } catch {
      setStatus("配置已加载（Bridge 未连接）");
    }
  }, [storage]);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : "加载失败"));
  }, [load]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (pathDialogOpen) {
        setPathDialogOpen(false);
      } else if (bridgeSettingsOpen) {
        setBridgeSettingsOpen(false);
      } else if (configToolsOpen) {
        setConfigToolsOpen(false);
      } else if (wizardOpen) {
        setWizardOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [bridgeSettingsOpen, configToolsOpen, pathDialogOpen, wizardOpen]);

  const selectedProfile = config?.profiles.find((profile) => profile.id === selectedId);
  const dashboardStatus = useMemo(
    () => config ? buildDashboardStatus(config, health, recentDiagnostics) : null,
    [config, health, recentDiagnostics]
  );

  const persistConfig = useCallback(async (nextConfig: AppConfig, sync = true) => {
    const saved = await storage.save(nextConfig);
    setConfig(saved);
    if (sync) {
      await syncBridgeThenApplyRules(saved);
      setStatus("已保存并同步");
    } else {
      await applyDynamicRules(saved);
      setStatus("已保存配置");
    }
    return saved;
  }, [storage]);

  const wizardComplete = useCallback(async (nextConfig: AppConfig, options?: { keepOpen?: boolean }) => {
    const saved = await persistConfig(nextConfig);
    if (!options?.keepOpen) {
      setWizardOpen(false);
    }
    const firstProfile = saved.profiles[saved.profiles.length - 1];
    if (firstProfile) {
      setSelectedId(firstProfile.id);
      setDraft(profileToDraft(firstProfile));
    }
  }, [persistConfig]);

  const selectProfile = useCallback((profile: ProxyProfile) => {
    setSelectedId(profile.id);
    setDraft(profileToDraft(profile));
  }, []);

  const addProfile = useCallback(() => {
    if (!config) return;
    if (config.profiles.length === 0) {
      setWizardOpen(true);
      return;
    }
    const next = createBlankProfile(draft.projectDir);
    setSelectedId(next.id);
    setDraft(next);
    setCurlText("");
    setStatus("正在编辑新配置");
  }, [config, draft.projectDir]);

  const persistDraftProfile = useCallback(async () => {
    if (!config) {
      return null;
    }
    const profile = draftToProfile(draft);
    if (profile.enabled) {
      const granted = await requestProfilePermission(profile);
      if (!granted) {
        setStatus("目标域名权限未授予");
        return null;
      }
    }
    const saved = await persistConfig(upsertProfile(config, profile));
    setSelectedId(profile.id);
    setDraft(profileToDraft(saved.profiles.find((item) => item.id === profile.id) ?? profile));
    return saved;
  }, [config, draft, persistConfig]);

  const saveProfile = useCallback(async () => {
    await persistDraftProfile();
  }, [persistDraftProfile]);

  const deleteProfile = useCallback(async () => {
    if (!config || !selectedId) {
      return;
    }
    const profiles = config.profiles.filter((profile) => profile.id !== selectedId);
    const saved = await persistConfig({ ...config, profiles });
    const firstProfile = saved.profiles[0];
    setSelectedId(firstProfile?.id ?? null);
    setDraft(firstProfile ? profileToDraft(firstProfile) : createBlankProfile(draft.projectDir));
  }, [config, draft.projectDir, persistConfig, selectedId]);

  const saveBridge = useCallback(async () => {
    if (!config) {
      return;
    }
    await persistConfig(config, false);
  }, [config, persistConfig]);

  const testBridge = useCallback(async () => {
    if (!config) {
      return;
    }
    const result = await getBridgeHealth(config);
    setHealth(result);
    setStatus(result.ok ? `Bridge v${result.version ?? "?"} 在线，已同步 ${result.profileCount ?? 0} 套配置` : "Bridge 状态异常");
  }, [config]);

  const runDoctor = useCallback(async () => {
    if (!config) {
      return;
    }
    const report = await getBridgeDoctor(config);
    setDoctorReport(report);
    const errorCount = report.checks.filter((check) => check.status === "error").length;
    const warningCount = report.checks.filter((check) => check.status === "warning").length;
    setStatus(report.ok
      ? `Bridge 自检完成：${warningCount > 0 ? `${warningCount} 个提醒` : "全部通过"}`
      : `Bridge 自检发现 ${errorCount} 个错误`);
  }, [config]);

  const syncNow = useCallback(async () => {
    if (!config) {
      return;
    }
    if (selectedId) {
      await persistDraftProfile();
      setStatus("当前配置已保存并同步");
      return;
    }
    await syncBridgeThenApplyRules(config);
    setStatus("规则与 bridge 已同步");
  }, [config, persistDraftProfile, selectedId]);

  const testProvider = useCallback(async () => {
    if (!config || !selectedId) {
      return;
    }
    try {
      const result = await testBridgeProvider(config, selectedId);
      setProviderTestResult(result);
      setStatus(result.ok ? "Provider 测试通过" : `Provider 测试失败: ${result.error ?? ""}`);
    } catch (error) {
      setProviderTestResult({ ok: false, error: error instanceof Error ? error.message : "测试失败" });
      setStatus("Provider 测试请求失败");
    }
  }, [config, selectedId]);

  const downloadConfig = useCallback((mode: ConfigExportMode) => {
    if (!config) {
      return;
    }
    const exported = createConfigExport(config, { mode });
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = mode === "backup" ? "proxy2localai-config-backup.json" : "proxy2localai-config-template.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(mode === "backup" ? "已导出本机备份" : "已导出分享模板");
  }, [config]);

  const importConfigFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const imported = parseConfigImport(JSON.parse(await file.text()));
      const saved = await persistConfig(imported, false);
      const firstProfile = saved.profiles[0];
      setSelectedId(firstProfile?.id ?? null);
      setDraft(firstProfile ? profileToDraft(firstProfile) : createBlankProfile());
      setDoctorReport(null);
      try {
        await syncBridgeThenApplyRules(saved);
        setStatus(`已导入 ${saved.profiles.length} 套配置并同步`);
      } catch {
        setStatus(`已导入 ${saved.profiles.length} 套配置，Bridge 未连接时可稍后同步`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? `导入失败：${error.message}` : "导入失败");
    }
  }, [persistConfig]);

  const updateDraft = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const fillFromCurl = useCallback(() => {
    try {
      setDraft((current) => applyCurlToDraft(current, curlText));
      setStatus("已从 cURL 填充目标地址、接口和方法");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "cURL 解析失败");
    }
  }, [curlText]);

  const openPathDialog = useCallback(() => {
    setPathDraft(draft.projectDir);
    setPathDialogOpen(true);
  }, [draft.projectDir]);

  const confirmPathDialog = useCallback(() => {
    updateDraft("projectDir", pathDraft.trim());
    setPathDialogOpen(false);
  }, [pathDraft]);

  const toggleProfileEnabled = useCallback(async (profile: ProxyProfile) => {
    if (!config) {
      return;
    }
    const nextProfile = { ...profile, enabled: !profile.enabled };
    if (nextProfile.enabled) {
      const granted = await requestProfilePermission(nextProfile);
      if (!granted) {
        setStatus("目标域名权限未授予");
        return;
      }
    }
    const saved = await persistConfig({
      ...config,
      profiles: config.profiles.map((item) => item.id === profile.id ? nextProfile : item)
    });
    if (selectedId === profile.id) {
      setDraft(profileToDraft(saved.profiles.find((item) => item.id === profile.id) ?? nextProfile));
    }
    setStatus(nextProfile.enabled ? "配置已启动" : "配置已关闭");
  }, [config, persistConfig, selectedId]);

  if (!config) {
    return <main className="shell"><p>{status}</p></main>;
  }

  return (
    <main className="shell">
      {dashboardStatus && (
        <BridgeStatusBar
          status={status}
          dashboard={dashboardStatus}
          doctorReport={doctorReport}
          onTestBridge={() => void testBridge()}
          onRunDoctor={() => void runDoctor().catch((error) => setStatus(error instanceof Error ? error.message : "Bridge 自检失败"))}
          onSync={() => void syncNow()}
          onOpenBridgeSettings={() => setBridgeSettingsOpen(true)}
          onOpenConfigTools={() => setConfigToolsOpen(true)}
        />
      )}

      {config.profiles.length === 0 && !wizardOpen && (
        <section className="empty-state">
          <strong>创建第一个本地 AI 代理</strong>
          <p>推荐从复制线上 API 的 cURL 开始，按“检查 Bridge → 粘贴 cURL → 选择 AI → 测试 → 保存”完成闭环。</p>
          <button type="button" onClick={() => setWizardOpen(true)}>创建代理</button>
        </section>
      )}

      <section className="console-layout">
          <ProfileList
            profiles={config.profiles}
            selectedId={selectedId}
            onSelect={selectProfile}
            onAdd={addProfile}
            onToggleEnabled={(profile) => void toggleProfileEnabled(profile).catch((error) => setStatus(error instanceof Error ? error.message : "切换失败"))}
          />
          <ProfileEditor
            draft={draft}
            curlText={curlText}
            selectedProfile={selectedProfile ?? null}
            onChangeDraft={updateDraft}
            onChangeCurlText={setCurlText}
            onFillFromCurl={fillFromCurl}
            onOpenPathDialog={openPathDialog}
            onSave={() => void saveProfile().catch((error) => setStatus(error instanceof Error ? error.message : "保存失败"))}
            onDelete={() => void deleteProfile()}
            onTestProvider={() => void testProvider()}
            testResult={providerTestResult}
          />
          <RecentRequestsPanel
            config={config}
            setStatus={setStatus}
            onItemsChange={setRecentDiagnostics}
          />
      </section>

      {bridgeSettingsOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setBridgeSettingsOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Bridge 设置" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <h2>Bridge 设置</h2>
              <button type="button" className="icon-button secondary" aria-label="关闭 Bridge 设置" onClick={() => setBridgeSettingsOpen(false)}>×</button>
            </div>
            <label>
              Bridge 地址
              <input
                value={config.bridgeBaseUrl}
                onChange={(event) => setConfig({ ...config, bridgeBaseUrl: event.target.value })}
              />
            </label>
            <label>
              本地 Token
              <input
                value={config.token}
                onChange={(event) => setConfig({ ...config, token: event.target.value })}
              />
            </label>
            <p className="risk-note">本地 Token 会用于扩展和 Bridge 通信；导出分享模板时不应包含真实 Token。</p>
            <div className="actions">
              <button type="button" onClick={() => void saveBridge().then(() => setBridgeSettingsOpen(false))}>保存 Bridge</button>
              <button type="button" className="secondary" onClick={() => setBridgeSettingsOpen(false)}>取消</button>
            </div>
          </section>
        </div>
      )}

      {configToolsOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfigToolsOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="配置导入导出" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <h2>配置导入导出</h2>
              <button type="button" className="icon-button secondary" aria-label="关闭导入导出" onClick={() => setConfigToolsOpen(false)}>×</button>
            </div>
            <p>用于备份、迁移到另一台电脑，或把规则模板分享给其他人。导入配置可能包含本地路径、命令参数和代理规则，请只导入可信文件。</p>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importConfigFile(event)}
            />
            <div className="actions">
              <button type="button" className="secondary" onClick={() => importInputRef.current?.click()}>导入配置</button>
              <button type="button" className="secondary" onClick={() => downloadConfig("backup")}>导出备份</button>
              <button type="button" className="secondary" onClick={() => downloadConfig("template")}>导出模板</button>
            </div>
          </section>
        </div>
      )}

      {pathDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="选择本地 AI 配置项目路径">
            <h2>本地 AI 配置项目路径</h2>
            <p>浏览器扩展不能读取文件夹的真实绝对路径，请粘贴 Claude/Codex 应该启动的项目目录。</p>
            <label>
              项目路径
              <input
                autoFocus
                value={pathDraft}
                placeholder="C:/project/demoProject/proxy2LocalAI"
                onChange={(event) => setPathDraft(event.target.value)}
              />
            </label>
            <div className="actions">
              <button type="button" onClick={confirmPathDialog}>使用此路径</button>
              <button type="button" className="secondary" onClick={() => setPathDialogOpen(false)}>取消</button>
            </div>
          </section>
        </div>
      )}

      {wizardOpen && config && (
        <CreateProxyWizard
          config={config}
          onComplete={(nextConfig, options) => wizardComplete(nextConfig, options)}
          onCancel={() => setWizardOpen(false)}
          setStatus={setStatus}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
