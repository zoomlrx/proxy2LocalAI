import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, FolderOpen, PanelRightOpen, Save } from "lucide-react";
import { type HttpMethod } from "@proxy2localai/shared";
import { Button, Field, Pill, ToggleSwitch, cx } from "../../ui/components";
import {
  applyResponseModeToDraft,
  type ProfileDraft
} from "../profileForm";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const RESPONSE_MODE_LABELS: Record<ProfileDraft["responseMode"], string> = {
  block: "普通 JSON",
  stream: "流式 SSE",
  custom_json: "自定义 JSON",
  mapped_sse: "映射 SSE"
};

interface ProfileInspectorSidebarProps {
  draft: ProfileDraft;
  selectedProfile: { id: string } | null;
  className?: string;
  onCreate: () => void;
  onChangeDraft: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void;
  onOpenPathDialog: () => void;
  onOpenConfig: () => void;
  onSave: () => void;
  onTestProvider?: () => void;
  testResult?: { ok: boolean; error?: string; output?: string | null } | null;
}

export function ProfileInspectorSidebar({
  draft,
  selectedProfile,
  className,
  onCreate,
  onChangeDraft,
  onOpenPathDialog,
  onOpenConfig,
  onSave,
  onTestProvider,
  testResult
}: ProfileInspectorSidebarProps) {
  const [targetUrl, setTargetUrl] = useState(() => formatTargetUrl(draft.targetOrigin, draft.targetPath));
  const [targetUrlError, setTargetUrlError] = useState("");
  const hasSelection = Boolean(selectedProfile);
  const targetUrlValue = useMemo(
    () => formatTargetUrl(draft.targetOrigin, draft.targetPath),
    [draft.targetOrigin, draft.targetPath]
  );

  useEffect(() => {
    setTargetUrl(targetUrlValue);
    setTargetUrlError("");
  }, [targetUrlValue]);

  const commitTargetUrl = useCallback(() => {
    const parsed = parseTargetUrl(targetUrl, draft.targetOrigin);
    if (!parsed) {
      setTargetUrlError("请输入 http/https 开头的完整目标接口 URL");
      return false;
    }
    setTargetUrlError("");
    if (parsed.targetOrigin !== draft.targetOrigin) {
      onChangeDraft("targetOrigin", parsed.targetOrigin);
    }
    if (parsed.targetPath !== draft.targetPath) {
      onChangeDraft("targetPath", parsed.targetPath);
    }
    return true;
  }, [draft.targetOrigin, draft.targetPath, onChangeDraft, targetUrl]);

  const toggleMethod = (method: HttpMethod) => {
    const hasMethod = draft.methods.includes(method);
    const nextMethods = hasMethod
      ? draft.methods.filter((item) => item !== method)
      : [...draft.methods, method];
    onChangeDraft("methods", (nextMethods.length ? nextMethods : [method]) as ProfileDraft["methods"]);
  };

  const changeResponseMode = (responseMode: ProfileDraft["responseMode"]) => {
    const next = applyResponseModeToDraft(draft, responseMode);
    for (const key of Object.keys(next) as Array<keyof ProfileDraft>) {
      if (next[key] !== draft[key]) {
        onChangeDraft(key, next[key]);
      }
    }
  };

  const saveFromSidebar = () => {
    if (commitTargetUrl()) {
      onSave();
    }
  };

  const testFromSidebar = () => {
    if (commitTargetUrl()) {
      onTestProvider?.();
    }
  };

  return (
    <aside
      className={cx(
        "grid min-w-0 content-start gap-4 rounded-console border border-console-border bg-console-muted p-4 xl:sticky xl:top-6 xl:w-[352px]",
        className
      )}
      aria-label="侧边日常编辑面板"
    >
      {hasSelection ? (
        <>
          <section className="grid min-w-0 gap-3">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <Field label="名称">
                  <input
                    value={draft.name}
                    onChange={(event) => onChangeDraft("name", event.target.value)}
                  />
                </Field>
                <p className="mt-1 truncate font-mono text-xs text-console-subtle" title={draft.id}>
                  {draft.id}
                </p>
              </div>
              <div className="grid justify-items-end gap-1 pt-7">
                <ToggleSwitch
                  checked={draft.enabled}
                  aria-label={draft.enabled ? "停用此代理" : "启用此代理"}
                  onClick={() => onChangeDraft("enabled", !draft.enabled)}
                />
                <span className="text-xs text-console-subtle">{draft.enabled ? "启用" : "停用"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="sm" icon={<Save size={14} aria-hidden="true" />} onClick={saveFromSidebar}>
                保存配置
              </Button>
              {onTestProvider && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<FlaskConical size={14} aria-hidden="true" />}
                  onClick={testFromSidebar}
                  title="发送最小 prompt 测试 provider 是否能工作"
                >
                  测试 Provider
                </Button>
              )}
            </div>
            {testResult && (
              <p
                className={cx(
                  "break-anywhere rounded-console-sm px-3 py-2 text-xs leading-5",
                  testResult.ok ? "bg-console-success-soft text-[#0b6740]" : "bg-console-danger-soft text-console-danger"
                )}
                aria-live="polite"
              >
                {testResult.ok ? "最近一次 Provider 测试通过" : `Provider 测试失败：${testResult.error ?? "请查看详情"}`}
              </p>
            )}
          </section>

          <SidebarSection title="基础配置">
            <Field label="目标接口 URL" hint="查询参数由真实请求携带，这里只保存 origin + path。">
              <input
                value={targetUrl}
                aria-invalid={Boolean(targetUrlError)}
                onChange={(event) => {
                  setTargetUrl(event.target.value);
                  setTargetUrlError("");
                }}
                onBlur={commitTargetUrl}
                placeholder="https://api.example.com/v1/chat/completions"
              />
              {targetUrlError && (
                <small className="text-xs font-normal leading-5 text-console-danger">{targetUrlError}</small>
              )}
            </Field>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-console-text">HTTP 方法</legend>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((method) => (
                  <label key={method} className="cursor-pointer">
                    <input
                      className="peer sr-only"
                      type="checkbox"
                      checked={draft.methods.includes(method)}
                      onChange={() => toggleMethod(method)}
                    />
                    <span className="inline-flex min-h-8 items-center rounded-console-sm border border-console-border bg-console-surface px-2.5 font-mono text-xs font-bold text-console-text peer-checked:border-console-primary peer-checked:bg-console-primary-soft peer-focus-visible:shadow-[0_0_0_3px_rgba(15,107,95,0.2)]">
                      {method}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Provider">
              <select value={draft.provider} onChange={(event) => onChangeDraft("provider", event.target.value as ProfileDraft["provider"])}>
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="custom">Custom</option>
              </select>
            </Field>

            <Field label="本地 AI 配置项目路径">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  value={draft.projectDir}
                  placeholder="C:/project/demoProject"
                  onChange={(event) => onChangeDraft("projectDir", event.target.value)}
                />
                <Button type="button" variant="secondary" size="icon" aria-label="选择本地 AI 配置项目路径" onClick={onOpenPathDialog}>
                  <FolderOpen size={16} aria-hidden="true" />
                </Button>
              </div>
            </Field>
          </SidebarSection>

          <details className="grid min-w-0 rounded-console-sm border border-console-border bg-console-surface p-3">
            <summary className="cursor-pointer list-none">
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold leading-5 text-console-strong">Prompt</span>
                <Pill tone={draft.prompt.trim() ? "info" : "default"}>{draft.prompt.trim() ? "已配置" : "可选"}</Pill>
              </span>
            </summary>
            <Field label="可选提示词" className="mt-3">
              <textarea
                rows={4}
                value={draft.prompt}
                placeholder="补充本地 AI 应该如何处理请求。"
                onChange={(event) => onChangeDraft("prompt", event.target.value)}
              />
            </Field>
          </details>

          <SidebarSection title="响应">
            <Field label="返回类型">
              <select value={draft.responseMode} onChange={(event) => changeResponseMode(event.target.value as ProfileDraft["responseMode"])}>
                {Object.entries(RESPONSE_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            {draft.responseMode === "custom_json" && (
              <Button type="button" variant="secondary" size="sm" icon={<PanelRightOpen size={14} aria-hidden="true" />} onClick={onOpenConfig}>
                编辑 JSON 模板
              </Button>
            )}
            {draft.responseMode === "mapped_sse" && (
              <Button type="button" variant="secondary" size="sm" icon={<PanelRightOpen size={14} aria-hidden="true" />} onClick={onOpenConfig}>
                打开映射编辑器
              </Button>
            )}
          </SidebarSection>

          <Button type="button" variant="ghost" size="sm" icon={<PanelRightOpen size={14} aria-hidden="true" />} onClick={onOpenConfig}>
            打开高级配置
          </Button>
        </>
      ) : (
        <section className="grid gap-3 rounded-console-sm border border-console-border bg-console-surface p-3">
          <h2 className="text-sm font-bold text-console-strong">尚未选择 Profile</h2>
          <p className="text-xs leading-5 text-console-subtle">
            选择左侧 Profile 后，可在这里完成目标接口、Provider、项目路径、返回类型、测试和保存。
          </p>
          <Button type="button" size="sm" onClick={onCreate}>创建代理</Button>
        </section>
      )}
    </aside>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 rounded-console-sm border border-console-border bg-console-surface p-3">
      <h2 className="text-[13px] font-semibold leading-5 text-console-strong">{title}</h2>
      {children}
    </section>
  );
}

function formatTargetUrl(origin: string, targetPath: string): string {
  const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  return `${origin}${normalizedPath}`;
}

function parseTargetUrl(value: string, fallbackOrigin: string): { targetOrigin: string; targetPath: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return {
      targetOrigin: url.origin,
      targetPath: url.pathname || "/"
    };
  } catch {
    if (trimmed.startsWith("/") && fallbackOrigin) {
      return {
        targetOrigin: fallbackOrigin,
        targetPath: trimmed.split(/[?#]/)[0] || "/"
      };
    }
    return null;
  }
}
