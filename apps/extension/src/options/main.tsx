import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createConfigExport,
  parseConfigImport,
  type AppConfig,
  type ConfigExportMode,
  type HttpMethod,
  type ProxyProfile
} from "@proxy2localai/shared";
import { applyDynamicRules } from "../lib/dnr";
import { getBridgeDoctor, getBridgeHealth, type BridgeDoctorReport } from "../lib/bridgeApi";
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
import "../ui.css";

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function OptionsApp() {
  const storage = useMemo(() => getChromeConfigStorage(), []);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(() => createBlankProfile());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("正在加载配置");
  const [doctorReport, setDoctorReport] = useState<BridgeDoctorReport | null>(null);
  const [curlText, setCurlText] = useState("");
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [pathDraft, setPathDraft] = useState("");

  const load = useCallback(async () => {
    const loaded = await storage.load();
    setConfig(loaded);
    const firstProfile = loaded.profiles[0];
    if (firstProfile) {
      setSelectedId(firstProfile.id);
      setDraft(profileToDraft(firstProfile));
    }
    setStatus("配置已加载");
  }, [storage]);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : "加载失败"));
  }, [load]);

  const selectedProfile = config?.profiles.find((profile) => profile.id === selectedId);

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

  const selectProfile = useCallback((profile: ProxyProfile) => {
    setSelectedId(profile.id);
    setDraft(profileToDraft(profile));
  }, []);

  const addProfile = useCallback(() => {
    const next = createBlankProfile(draft.projectDir);
    setSelectedId(next.id);
    setDraft(next);
    setCurlText("");
    setStatus("正在编辑新配置");
  }, [draft.projectDir]);

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
    const health = await getBridgeHealth(config);
    setStatus(health.ok ? `Bridge 在线，已同步 ${health.profileCount ?? 0} 套配置` : "Bridge 状态异常");
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

  const toggleMethod = (method: HttpMethod) => {
    setDraft((current) => {
      const hasMethod = current.methods.includes(method);
      const nextMethods = hasMethod
        ? current.methods.filter((item) => item !== method)
        : [...current.methods, method];
      return { ...current, methods: nextMethods.length ? nextMethods : [method] };
    });
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
      <header className="topbar">
        <div>
          <h1>Proxy2LocalAI</h1>
          <p>{status}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void testBridge()}>测试 Bridge</button>
          <button type="button" onClick={() => void runDoctor().catch((error) => setStatus(error instanceof Error ? error.message : "Bridge 自检失败"))}>自检 Bridge</button>
          <button type="button" onClick={() => void syncNow()}>同步</button>
        </div>
      </header>

      <section className="bridge-row">
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
        <button type="button" onClick={() => void saveBridge()}>保存 Bridge</button>
      </section>

      <section className="tool-row">
        <div>
          <strong>配置文件</strong>
          <p>用于备份、迁移到另一台电脑，或把规则模板分享给其他人。</p>
        </div>
        <div className="actions">
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importConfigFile(event)}
          />
          <button type="button" className="secondary" onClick={() => importInputRef.current?.click()}>导入配置</button>
          <button type="button" className="secondary" onClick={() => downloadConfig("backup")}>导出备份</button>
          <button type="button" className="secondary" onClick={() => downloadConfig("template")}>导出模板</button>
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

      <section className="layout">
        <aside className="profile-list">
          <div className="list-title">
            <strong>代理配置</strong>
            <button type="button" onClick={addProfile}>新增</button>
          </div>
          {config.profiles.map((profile) => (
            <div
              key={profile.id}
              className={profile.id === selectedId ? "profile-item active" : "profile-item"}
            >
              <button
                type="button"
                className="profile-item-name"
                onClick={() => selectProfile(profile)}
              >
                <span>{profile.name}</span>
                <small>{profile.enabled ? "启用" : "停用"} · {profile.provider} · {profile.responseMode}</small>
              </button>
              <button
                type="button"
                className="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  void toggleProfileEnabled(profile).catch((error) => setStatus(error instanceof Error ? error.message : "切换失败"));
                }}
              >
                {profile.enabled ? "关闭" : "启动"}
              </button>
            </div>
          ))}
          {config.profiles.length === 0 && <p className="muted">还没有配置</p>}
        </aside>

        <form className="editor" onSubmit={(event) => {
          event.preventDefault();
          void saveProfile().catch((error) => setStatus(error instanceof Error ? error.message : "保存失败"));
        }}>
          <section className="curl-panel">
            <label>
              粘贴 cURL 配置
              <textarea
                value={curlText}
                placeholder="curl 'https://api.example.com/v1/chat/completions' -X POST --data-raw '{...}'"
                onChange={(event) => setCurlText(event.target.value)}
              />
            </label>
            <button type="button" onClick={fillFromCurl}>从 cURL 填充</button>
          </section>

          <div className="grid two">
            <label>
              配置 ID
              <input value={draft.id} onChange={(event) => updateDraft("id", event.target.value)} />
            </label>
            <label>
              名称
              <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => updateDraft("enabled", event.target.checked)}
            />
            启用此代理
          </label>

          <div className="grid two">
            <label>
              目标地址
              <input value={draft.targetOrigin} onChange={(event) => updateDraft("targetOrigin", event.target.value)} />
            </label>
            <label>
              目标接口
              <input value={draft.targetPath} onChange={(event) => updateDraft("targetPath", event.target.value)} />
            </label>
          </div>

          <fieldset>
            <legend>HTTP 方法</legend>
            <div className="segmented">
              {methods.map((method) => (
                <label key={method}>
                  <input
                    type="checkbox"
                    checked={draft.methods.includes(method)}
                    onChange={() => toggleMethod(method)}
                  />
                  <span>{method}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid two">
            <label>
              AI Provider
              <select value={draft.provider} onChange={(event) => updateDraft("provider", event.target.value as ProfileDraft["provider"])}>
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              返回类型
              <select value={draft.responseMode} onChange={(event) => updateDraft("responseMode", event.target.value as ProfileDraft["responseMode"])}>
                <option value="block">普通 JSON</option>
                <option value="stream">流式 SSE</option>
                <option value="custom_json">自定义 JSON</option>
                <option value="mapped_sse">映射 SSE</option>
              </select>
            </label>
          </div>

          <div className="grid two">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.allowDangerousCli}
                onChange={(event) => updateDraft("allowDangerousCli", event.target.checked)}
              />
              最高权限执行本机 CLI
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.enableConversationMemory}
                onChange={(event) => updateDraft("enableConversationMemory", event.target.checked)}
              />
              启用多轮上下文记忆
            </label>
          </div>

          <label>
            本地 AI 配置项目路径
            <input
              readOnly
              value={draft.projectDir}
              placeholder="点击选择或粘贴本地绝对路径"
              onClick={openPathDialog}
              onFocus={openPathDialog}
            />
          </label>

          <div className="grid two">
            <label>
              超时 ms
              <input
                type="number"
                min="0"
                value={draft.timeoutMs}
                onChange={(event) => updateDraft("timeoutMs", Number(event.target.value))}
              />
              <small>0 表示不限时。</small>
            </label>
            <label>
              请求体上限 bytes（0 表示不限）
              <input
                type="number"
                min="0"
                value={draft.maxBodyBytes}
                onChange={(event) => updateDraft("maxBodyBytes", Number(event.target.value))}
              />
            </label>
          </div>

          <section className="custom-json-panel">
            <label>
              接口参数上下文正则
              <textarea
                value={draft.contextRegex}
                placeholder='"messages"\\s*:\\s*(\\[[\\s\\S]*?\\])'
                onChange={(event) => updateDraft("contextRegex", event.target.value)}
              />
              <small>对请求参数 JSON 执行；存在捕获组时使用第一个捕获组，留空则使用完整参数。</small>
            </label>
            <label>
              正则标记
              <input
                value={draft.contextRegexFlags}
                placeholder="s"
                onChange={(event) => updateDraft("contextRegexFlags", event.target.value)}
              />
            </label>
          </section>

          {draft.provider !== "custom" && (
            <section className="custom-json-panel">
              <label>
                AI 工具追加参数
                <textarea
                  value={draft.providerArgs}
                  placeholder="--dangerously-skip-permissions"
                  onChange={(event) => updateDraft("providerArgs", event.target.value)}
                />
                <small>每行一个参数，会追加到 {draft.provider === "claude" ? "Claude Code" : "Codex"} 默认命令后。</small>
              </label>
            </section>
          )}

          {draft.provider === "custom" && (
            <div className="grid two">
              <label>
                Custom 命令
                <input value={draft.customCommand} onChange={(event) => updateDraft("customCommand", event.target.value)} />
              </label>
              <label>
                Custom 参数
                <textarea value={draft.customArgs} onChange={(event) => updateDraft("customArgs", event.target.value)} />
              </label>
            </div>
          )}

          {draft.responseMode === "custom_json" && (
            <section className="custom-json-panel">
              <label>
                提取 SSE 事件名
                <textarea
                  value={draft.sseDataEvents}
                  placeholder="message"
                  onChange={(event) => updateDraft("sseDataEvents", event.target.value)}
                />
                <small>每行或逗号分隔一个事件名，默认 message。</small>
              </label>
              <label>
                JSON 返回模板
                <textarea
                  value={draft.customJsonTemplate}
                  placeholder='{ "code": 0, "data": <aiData/> }'
                  onChange={(event) => updateDraft("customJsonTemplate", event.target.value)}
                />
                <small>使用 &lt;aiData/&gt; 表示聚合后的端侧 AI 数据；留空则直接返回 AI 数据。</small>
              </label>
            </section>
          )}

          {draft.responseMode === "mapped_sse" && (
            <section className="custom-json-panel">
              <label>
                SSE 事件映射
                <textarea
                  value={draft.sseEventMappings}
                  placeholder={"reasoning=reasoning\nmessage=message"}
                  onChange={(event) => updateDraft("sseEventMappings", event.target.value)}
                />
                <small>每行一个 source=targetEvent；只返回已映射的 provider 事件。</small>
              </label>
              <label>
                done 事件 JSON
                <textarea
                  value={draft.sseDoneEvent}
                  placeholder='{"conversationId":"","status":"completed"}'
                  onChange={(event) => updateDraft("sseDoneEvent", event.target.value)}
                />
                <small>请求结束时作为 event:done 的 data 返回。</small>
              </label>
            </section>
          )}

          <label>
            提示词
            <textarea value={draft.prompt} onChange={(event) => updateDraft("prompt", event.target.value)} />
          </label>

          <div className="actions">
            <button type="submit">保存配置</button>
            <button type="button" className="danger" disabled={!selectedProfile} onClick={() => void deleteProfile()}>
              删除
            </button>
          </div>
        </form>
      </section>

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
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
