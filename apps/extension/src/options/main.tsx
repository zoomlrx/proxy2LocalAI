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
import { getBridgeDoctor, getBridgeHealth, getRecentDiagnostics, testBridgeProvider, type BridgeDoctorReport, type BridgeHealth } from "../lib/bridgeApi";
import { requestProfilePermission } from "../lib/permissions";
import { getChromeConfigStorage } from "../lib/storage";
import { syncBridgeThenApplyRules } from "../lib/sync";
import { Button, DrawerShell, Field, ModalShell, Panel, Pill, StatusDot } from "../ui/components";
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
import { ProfileInspectorSidebar } from "./components/ProfileInspectorSidebar";
import { buildDashboardStatus, buildProxyChainSteps } from "./dashboardView";
import { buildProfileInspectorView } from "./profileWorkspaceView";
import { Plus, RotateCw } from "lucide-react";
import "../ui.css";

type ProfileDetailsTab = "config" | "requests";

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
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [profileDetailsTab, setProfileDetailsTab] = useState<ProfileDetailsTab>("config");
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
    if (!config) {
      return;
    }
    let cancelled = false;
    void getRecentDiagnostics(config)
      .then((result) => {
        if (!cancelled) {
          setRecentDiagnostics(result.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentDiagnostics([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (pathDialogOpen) {
        setPathDialogOpen(false);
      } else if (profileDetailsOpen) {
        setProfileDetailsOpen(false);
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
  }, [bridgeSettingsOpen, configToolsOpen, pathDialogOpen, profileDetailsOpen, wizardOpen]);

  const selectedProfile = config?.profiles.find((profile) => profile.id === selectedId);
  const dashboardStatus = useMemo(
    () => config ? buildDashboardStatus(config, health, recentDiagnostics) : null,
    [config, health, recentDiagnostics]
  );
  const proxyChainSteps = useMemo(
    () => buildProxyChainSteps(health, recentDiagnostics),
    [health, recentDiagnostics]
  );
  const profileInspectorView = useMemo(
    () => buildProfileInspectorView(selectedProfile, recentDiagnostics),
    [recentDiagnostics, selectedProfile]
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

  const editProfile = useCallback((profile: ProxyProfile) => {
    setSelectedId(profile.id);
    setDraft(profileToDraft(profile));
    setProfileDetailsTab("config");
    setProfileDetailsOpen(true);
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
    setProfileDetailsTab("config");
    setProfileDetailsOpen(true);
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
    setProfileDetailsOpen(false);
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

  const openProfileConfigDetails = useCallback(() => {
    if (!selectedProfile) {
      return;
    }
    setProfileDetailsTab("config");
    setProfileDetailsOpen(true);
  }, [selectedProfile]);

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
    return (
      <main className="grid min-h-screen place-items-center bg-console-bg p-6">
        <Panel className="max-w-md text-center">
          <p className="text-sm text-console-subtle" aria-live="polite">{status}</p>
        </Panel>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-console-bg p-4 md:p-6">
      <div className="mx-auto grid max-w-[1440px] gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(320px,352px)] xl:grid-cols-[236px_minmax(0,1fr)_minmax(320px,352px)]">
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

        <section className="grid min-w-0 content-start gap-4">
          <Panel className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold leading-tight text-console-strong">本地 AI 代理控制台</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-console-subtle" aria-live="polite">{status}</p>
            </div>
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              <Button type="button" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setWizardOpen(true)}>创建代理</Button>
              <Button type="button" variant="secondary" icon={<RotateCw size={16} aria-hidden="true" />} onClick={() => void syncNow()}>
                同步
              </Button>
            </div>
          </Panel>

          {dashboardStatus && (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="代理控制台状态">
              <Panel as="article" className={dashboardStatus.bridgeState === "online" ? "border-[rgba(22,130,85,0.35)] bg-console-success-soft" : "border-[rgba(184,50,50,0.35)] bg-console-danger-soft"}>
                <span className="text-xs font-semibold text-console-subtle">Bridge</span>
                <strong className="mt-1 block truncate text-lg text-console-strong">{dashboardStatus.bridgeLabel}</strong>
                <small className="mt-1 block truncate text-xs text-console-subtle">{dashboardStatus.bridgeVersionLabel || "未获取版本"}</small>
              </Panel>
              <Panel as="article">
                <span className="text-xs font-semibold text-console-subtle">同步状态</span>
                <strong className="mt-1 block truncate text-lg text-console-strong">{status}</strong>
                <small className="mt-1 block truncate text-xs text-console-subtle">扩展、DNR 与 Bridge</small>
              </Panel>
              <Panel as="article">
                <span className="text-xs font-semibold text-console-subtle">启用 Profile</span>
                <strong className="mt-1 block truncate text-lg text-console-strong">{dashboardStatus.enabledProfileCount}/{dashboardStatus.profileCount}</strong>
                <small className="mt-1 block truncate text-xs text-console-subtle">当前代理规则</small>
              </Panel>
              <Panel as="article" className={dashboardStatus.failedRequestCount > 0 ? "border-[rgba(184,50,50,0.35)] bg-console-danger-soft" : "border-[rgba(22,130,85,0.35)] bg-console-success-soft"}>
                <span className="text-xs font-semibold text-console-subtle">最近失败</span>
                <strong className="mt-1 block truncate text-lg text-console-strong">{dashboardStatus.failedRequestCount}</strong>
                <small className="mt-1 block truncate text-xs text-console-subtle">来自诊断台</small>
              </Panel>
            </section>
          )}

          <Panel className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="text-base font-bold text-console-strong">请求链路健康度</h2>
              <p className="text-sm leading-6 text-console-subtle">把代理故障拆成可定位阶段，避免只看到笼统的请求失败。</p>
            </div>
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="代理链路阶段">
              {proxyChainSteps.map((item) => (
                <article key={item.id} className={item.state === "ok" ? "grid gap-2 rounded-console-sm border border-[rgba(22,130,85,0.28)] bg-console-success-soft p-3" : item.state === "warning" ? "grid gap-2 rounded-console-sm border border-[rgba(166,101,0,0.3)] bg-console-warning-soft p-3" : "grid gap-2 rounded-console-sm border border-console-border bg-console-muted p-3"}>
                  <StatusDot tone={item.state === "ok" ? "success" : item.state === "warning" ? "warning" : "default"} />
                  <strong className="truncate text-xs text-console-strong">{item.label}</strong>
                  <small className="truncate text-xs text-console-subtle">{item.detail}</small>
                </article>
              ))}
            </div>
          </Panel>

          {config.profiles.length === 0 && !wizardOpen && (
            <Panel className="grid gap-3 border-[rgba(35,105,168,0.26)] bg-console-info-soft sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <strong className="text-sm text-console-strong">创建第一个本地 AI 代理</strong>
                <p className="mt-1 text-sm leading-6 text-console-subtle">推荐从复制线上 API 的 cURL 开始，按“检查 Bridge → 粘贴 cURL → 选择 AI → 测试 → 保存”完成闭环。</p>
              </div>
              <Button type="button" onClick={() => setWizardOpen(true)}>创建代理</Button>
            </Panel>
          )}

          <ProfileList
            profiles={config.profiles}
            selectedId={selectedId}
            onSelect={selectProfile}
            onEdit={editProfile}
            onAdd={addProfile}
            onToggleEnabled={(profile) => void toggleProfileEnabled(profile).catch((error) => setStatus(error instanceof Error ? error.message : "切换失败"))}
          />
        </section>

        <ProfileInspectorSidebar
          draft={draft}
          selectedProfile={selectedProfile ?? null}
          className="lg:col-start-auto"
          onCreate={() => setWizardOpen(true)}
          onChangeDraft={updateDraft}
          onOpenPathDialog={openPathDialog}
          onOpenConfig={openProfileConfigDetails}
          onSave={() => void saveProfile().catch((error) => setStatus(error instanceof Error ? error.message : "保存失败"))}
          onTestProvider={() => void testProvider()}
          testResult={providerTestResult}
        />

      </div>

      {profileDetailsOpen && (
        <DrawerShell
          title={selectedProfile ? profileInspectorView.drawerTitle : "新建代理详情"}
          label="代理配置详情"
          onClose={() => setProfileDetailsOpen(false)}
          closeLabel="关闭代理配置详情"
        >
          <div className="grid gap-4">
            <Panel className="grid gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-console-strong">{selectedProfile ? profileInspectorView.title : draft.name || "新建代理"}</h2>
                  <p className="mt-1 truncate text-sm text-console-subtle">{selectedProfile ? profileInspectorView.subtitle : draft.id}</p>
                </div>
                <Pill tone={draft.enabled ? "success" : "default"}>{draft.enabled ? "启用" : "停用"}</Pill>
              </div>
              {selectedProfile ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {profileInspectorView.summary.map((item) => (
                    <div key={item.label} className="grid min-w-0 grid-cols-[86px_minmax(0,1fr)] gap-2">
                      <dt className="font-semibold text-console-subtle">{item.label}</dt>
                      <dd className="truncate" title={item.value}>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm leading-6 text-console-subtle">新增配置时可先粘贴 cURL 自动填充基础字段，保存后会生成对应代理规则。</p>
              )}
            </Panel>

            {selectedProfile && (
              <div className="inline-flex w-full gap-1 rounded-console border border-console-border bg-console-muted p-1" role="tablist" aria-label="代理详情内容">
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileDetailsTab === "config"}
                  className={profileDetailsTab === "config" ? "min-h-9 flex-1 rounded-console-sm border border-console-primary bg-console-surface px-3 text-sm font-bold text-console-strong shadow-sm" : "min-h-9 flex-1 rounded-console-sm border border-transparent px-3 text-sm font-semibold text-console-subtle hover:bg-console-raised"}
                  onClick={() => setProfileDetailsTab("config")}
                >
                  配置详情
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={profileDetailsTab === "requests"}
                  className={profileDetailsTab === "requests" ? "min-h-9 flex-1 rounded-console-sm border border-console-primary bg-console-surface px-3 text-sm font-bold text-console-strong shadow-sm" : "min-h-9 flex-1 rounded-console-sm border border-transparent px-3 text-sm font-semibold text-console-subtle hover:bg-console-raised"}
                  onClick={() => setProfileDetailsTab("requests")}
                >
                  请求调用日志
                </button>
              </div>
            )}

            {profileDetailsTab === "requests" && selectedProfile ? (
              <RecentRequestsPanel
                config={config}
                setStatus={setStatus}
                onItemsChange={setRecentDiagnostics}
              />
            ) : (
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
            )}
          </div>
        </DrawerShell>
      )}

      {bridgeSettingsOpen && (
        <ModalShell title="Bridge 设置" onClose={() => setBridgeSettingsOpen(false)} closeLabel="关闭 Bridge 设置">
          <div className="grid gap-4">
            <Field label="Bridge 地址">
              <input
                value={config.bridgeBaseUrl}
                onChange={(event) => setConfig({ ...config, bridgeBaseUrl: event.target.value })}
              />
            </Field>
            <Field label="本地 Token">
              <input
                value={config.token}
                onChange={(event) => setConfig({ ...config, token: event.target.value })}
              />
            </Field>
            <p className="rounded-console border border-[rgba(166,101,0,0.3)] bg-console-warning-soft p-3 text-sm leading-6 text-console-subtle">本地 Token 会用于扩展和 Bridge 通信；导出分享模板时不应包含真实 Token。</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveBridge().then(() => setBridgeSettingsOpen(false))}>保存 Bridge</Button>
              <Button type="button" variant="secondary" onClick={() => setBridgeSettingsOpen(false)}>取消</Button>
            </div>
          </div>
        </ModalShell>
      )}

      {configToolsOpen && (
        <ModalShell title="配置导入导出" onClose={() => setConfigToolsOpen(false)} closeLabel="关闭导入导出">
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-console-subtle">用于备份、迁移到另一台电脑，或把规则模板分享给其他人。导入配置可能包含本地路径、命令参数和代理规则，请只导入可信文件。</p>
            <input
              ref={importInputRef}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importConfigFile(event)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => importInputRef.current?.click()}>导入配置</Button>
              <Button type="button" variant="secondary" onClick={() => downloadConfig("backup")}>导出备份</Button>
              <Button type="button" variant="secondary" onClick={() => downloadConfig("template")}>导出模板</Button>
            </div>
          </div>
        </ModalShell>
      )}

      {pathDialogOpen && (
        <ModalShell title="本地 AI 配置项目路径" label="选择本地 AI 配置项目路径" onClose={() => setPathDialogOpen(false)} closeLabel="关闭路径选择">
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-console-subtle">浏览器扩展不能读取文件夹的真实绝对路径，请粘贴 Claude/Codex 应该启动的项目目录。</p>
            <Field label="项目路径">
              <input
                autoFocus
                value={pathDraft}
                placeholder="C:/project/demoProject/proxy2LocalAI"
                onChange={(event) => setPathDraft(event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirmPathDialog}>使用此路径</Button>
              <Button type="button" variant="secondary" onClick={() => setPathDialogOpen(false)}>取消</Button>
            </div>
          </div>
        </ModalShell>
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
