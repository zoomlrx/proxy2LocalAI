import React, { useCallback, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { parseCurlCommand, type AppConfig } from "@proxy2localai/shared";
import { getBridgeHealth, testBridgeProfileDraft } from "../../lib/bridgeApi";
import type { CurlSummary, ProfileDraft } from "../profileForm";
import {
  createWizardProfileFromCurl,
  draftToProfile,
  getRecommendedTemplateId,
  MESSAGE_RETURN_STRUCTURE_OPTIONS,
  summarizeCurlCommand,
  upsertProfile
} from "../profileForm";
import { Button, Field, Pill, StatusDot, cx } from "../../ui/components";

type WizardStep = "bridge" | "curl" | "ai" | "path" | "format" | "done";

interface CreateProxyWizardProps {
  config: AppConfig;
  onComplete: (config: AppConfig, options?: { keepOpen?: boolean }) => void | Promise<void>;
  onCancel: () => void;
  setStatus: (status: string) => void;
}

const STEPS: Array<{ id: WizardStep; title: string; hint: string }> = [
  { id: "bridge", title: "检查 Bridge", hint: "确认本地服务可用" },
  { id: "curl", title: "解析 cURL", hint: "提取目标和请求体" },
  { id: "ai", title: "选择 Provider", hint: "Claude 或 Codex" },
  { id: "path", title: "项目路径", hint: "本地 AI 启动目录" },
  { id: "format", title: "返回格式", hint: "JSON 或 SSE" },
  { id: "done", title: "测试并保存", hint: "保存前确认摘要" }
];

function SummaryList({ summary }: { summary: CurlSummary }) {
  return (
    <dl className="grid gap-2 rounded-console border border-console-border bg-console-muted p-3 text-sm">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">域名</dt><dd className="truncate">{summary.origin}</dd></div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">路径</dt><dd className="truncate">{summary.path}</dd></div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">方法</dt><dd>{summary.method}</dd></div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">请求体</dt><dd className="break-anywhere">{summary.bodySummary}</dd></div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">流式</dt><dd>{summary.stream ? "是" : "否"}</dd></div>
    </dl>
  );
}

export function CreateProxyWizard({ config, onComplete, onCancel, setStatus }: CreateProxyWizardProps) {
  const [step, setStep] = useState<WizardStep>("bridge");
  const [curlText, setCurlText] = useState("");
  const [projectDir, setProjectDir] = useState(config.profiles[0]?.projectDir ?? "");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [responseMode, setResponseMode] = useState<"stream" | "block" | "custom_json" | "mapped_sse">("stream");
  const [messageReturnStructure, setMessageReturnStructure] = useState<ProfileDraft["messageReturnStructure"]>("anthropic_messages");
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; stages: Array<{ id: string; status: string; message?: string }> } | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [curlSummary, setCurlSummary] = useState<CurlSummary | null>(null);

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const selectedMessageReturnStructure = MESSAGE_RETURN_STRUCTURE_OPTIONS.find(
    (option) => option.value === messageReturnStructure
  ) ?? MESSAGE_RETURN_STRUCTURE_OPTIONS[0];

  const goNext = useCallback(() => {
    const next = STEPS[stepIndex + 1]?.id;
    if (next) setStep(next);
  }, [stepIndex]);

  const goBack = useCallback(() => {
    const prev = STEPS[stepIndex - 1]?.id;
    if (prev) setStep(prev);
  }, [stepIndex]);

  const checkBridge = useCallback(async () => {
    try {
      const health = await getBridgeHealth(config);
      setBridgeOnline(health.ok);
      if (health.ok) {
        setStatus("Bridge 在线");
        goNext();
      }
    } catch {
      setBridgeOnline(false);
      setStatus("Bridge 未连接");
    }
  }, [config, setStatus, goNext]);

  const parseCurl = useCallback(() => {
    if (!curlText.trim()) {
      setStatus("请粘贴 cURL 命令");
      return;
    }
    try {
      parseCurlCommand(curlText);
      const summary = summarizeCurlCommand(curlText);
      setCurlSummary(summary);
      setResponseMode(summary.stream ? "stream" : "block");
      goNext();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "cURL 解析失败");
    }
  }, [curlText, setStatus, goNext]);

  const generateDraft = useCallback(() => {
    try {
      const wizardDraft = createWizardProfileFromCurl(curlText, projectDir);
      wizardDraft.provider = provider;
      wizardDraft.responseMode = responseMode;
      wizardDraft.messageReturnStructure = messageReturnStructure;
      wizardDraft.responseTemplateId = getRecommendedTemplateId(responseMode);
      setDraft(wizardDraft);
      setStep("done");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建配置失败");
    }
  }, [curlText, projectDir, provider, responseMode, messageReturnStructure, setStatus]);

  const saveAndTest = useCallback(async () => {
    if (!draft) return;
    try {
      const profile = draftToProfile(draft);
      const nextConfig = upsertProfile(config, profile);
      await onComplete(nextConfig);
      setStatus("向导配置已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    }
  }, [draft, config, onComplete, setStatus]);

  const runTest = useCallback(async () => {
    if (!draft) return;
    try {
      const profile = draftToProfile(draft);
      const result = await testBridgeProfileDraft(config, profile, {
        headers: { "content-type": "application/json" },
        body: { messages: [{ role: "user", content: "ping" }] }
      });
      setTestResult(result);
      setStatus(result.ok ? "测试通过" : "测试未通过");
    } catch (error) {
      setTestResult({ ok: false, stages: [{ id: "network", status: "error", message: error instanceof Error ? error.message : "测试失败" }] });
      setStatus("测试请求失败");
    }
  }, [draft, config, setStatus]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(12,20,25,0.34)] p-4" role="presentation">
      <section className="grid max-h-[min(760px,calc(100vh-32px))] w-full max-w-4xl overflow-hidden rounded-console border border-console-border-strong bg-console-surface shadow-console md:grid-cols-[248px_minmax(0,1fr)]" role="dialog" aria-modal="true" aria-label="创建代理配置向导">
        <aside className="grid content-start gap-4 overflow-auto bg-[#12201d] p-5 text-[#dce7e4]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">创建代理</h2>
              <p className="mt-2 text-sm leading-6 text-[#b8c8c4]">把首次配置拆成可验证步骤，每一步只做一个决策。</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="关闭创建向导" className="text-white hover:bg-white/10" onClick={onCancel}>
              <X size={17} aria-hidden="true" />
            </Button>
          </div>
          <ol className="grid gap-2 p-0">
            {STEPS.map((item, index) => (
              <li key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-1">
                <span className={cx(
                  "grid h-6 w-6 place-items-center rounded-full border text-xs font-bold",
                  index <= stepIndex ? "border-[#89e7d5] bg-console-primary text-white" : "border-white/30 text-white"
                )}>
                  {index < stepIndex ? <CheckCircle2 size={14} aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-white">{item.title}</strong>
                  <small className="block truncate text-xs text-[#b8c8c4]">{item.hint}</small>
                </span>
              </li>
            ))}
          </ol>
        </aside>

        <div className="grid content-start gap-4 overflow-auto p-5">
          {curlSummary && step !== "bridge" && step !== "curl" && <SummaryList summary={curlSummary} />}

          {step === "bridge" && (
            <div className="grid gap-4">
              <div>
                <h3 className="text-base font-bold text-console-strong">检查 Bridge 服务</h3>
                <p className="mt-1 text-sm leading-6 text-console-subtle">Bridge 是连接浏览器和本地 AI 工具的桥梁。请确保它正在运行。</p>
              </div>
              {bridgeOnline === false && (
                <div className="grid gap-2 rounded-console border border-[rgba(184,50,50,0.28)] bg-console-danger-soft p-3 text-sm">
                  <p className="text-console-subtle">Bridge 未连接，请先启动：</p>
                  <code className="font-mono text-xs text-console-text">npm run start:bridge</code>
                  <code className="font-mono text-xs text-console-text">.\scripts\start-bridge.ps1</code>
                  <code className="font-mono text-xs text-console-text">./scripts/start-bridge.sh</code>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={onCancel}>取消</Button>
                <Button type="button" onClick={() => void checkBridge()}>检查 Bridge</Button>
              </div>
            </div>
          )}

          {step === "curl" && (
            <div className="grid gap-4">
              <div>
                <h3 className="text-base font-bold text-console-strong">粘贴 API 请求</h3>
                <p className="mt-1 text-sm leading-6 text-console-subtle">在浏览器开发者工具中复制要代理的 API 请求为 cURL，然后粘贴到下方。</p>
              </div>
              <Field label="cURL">
                <textarea
                  value={curlText}
                  placeholder="curl 'https://api.example.com/v1/chat/completions' -H 'content-type: application/json' --data-raw '{...}'"
                  onChange={(e) => setCurlText(e.target.value)}
                  rows={6}
                />
              </Field>
              {curlSummary && <SummaryList summary={curlSummary} />}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={goBack}>上一步</Button>
                <Button type="button" onClick={parseCurl}>下一步</Button>
              </div>
            </div>
          )}

          {step === "ai" && (
            <div className="grid gap-4">
              <div>
                <h3 className="text-base font-bold text-console-strong">选择本地 AI 工具</h3>
                <p className="mt-1 text-sm leading-6 text-console-subtle">选择用于生成响应的本地 AI 命令行工具。</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(["claude", "codex"] as const).map((item) => (
                  <label key={item} className={cx("grid cursor-pointer gap-1 rounded-console border bg-console-surface p-3", provider === item ? "border-console-primary bg-console-primary-soft" : "border-console-border")}>
                    <input className="sr-only" type="radio" name="provider" checked={provider === item} onChange={() => setProvider(item)} />
                    <strong className="text-console-strong">{item === "claude" ? "Claude Code" : "Codex CLI"}</strong>
                    <small className="text-console-subtle">{item === "claude" ? "Anthropic 官方 CLI 工具" : "OpenAI Codex 命令行工具"}</small>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={goBack}>上一步</Button>
                <Button type="button" onClick={goNext}>下一步</Button>
              </div>
            </div>
          )}

          {step === "path" && (
            <div className="grid gap-4">
              <div>
                <h3 className="text-base font-bold text-console-strong">选择项目路径</h3>
                <p className="mt-1 text-sm leading-6 text-console-subtle">AI 工具将在此目录下启动。请输入本地项目的绝对路径。</p>
              </div>
              <Field label="项目路径">
                <input value={projectDir} placeholder="C:/project/demoProject/proxy2LocalAI" onChange={(e) => setProjectDir(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={goBack}>上一步</Button>
                <Button type="button" onClick={goNext} disabled={!projectDir.trim()}>下一步</Button>
              </div>
            </div>
          )}

          {step === "format" && (
            <div className="grid gap-4">
              <div>
                <h3 className="text-base font-bold text-console-strong">选择返回格式</h3>
                <p className="mt-1 text-sm leading-6 text-console-subtle">选择代理返回给浏览器的响应格式。</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["stream", "流式 SSE", "逐字流式返回，适合聊天场景"],
                  ["block", "普通 JSON", "等待完整响应后返回"],
                  ["mapped_sse", "映射 SSE", "映射 provider 事件到自定义 SSE"],
                  ["custom_json", "自定义 JSON", "使用 JSON 模板包装 AI 数据"]
                ].map(([value, title, hint]) => (
                  <label key={value} className={cx("grid cursor-pointer gap-1 rounded-console border bg-console-surface p-3", responseMode === value ? "border-console-primary bg-console-primary-soft" : "border-console-border")}>
                    <input className="sr-only" type="radio" name="format" checked={responseMode === value} onChange={() => setResponseMode(value as typeof responseMode)} />
                    <span className="flex items-center gap-2">
                      <strong className="text-console-strong">{title}</strong>
                      {((value === "stream" && curlSummary?.stream !== false) || (value === "block" && curlSummary?.stream === false)) && <Pill tone="info">推荐</Pill>}
                    </span>
                    <small className="text-console-subtle">{hint}</small>
                  </label>
                ))}
              </div>
              <Field label="消息返回结构" hint={selectedMessageReturnStructure?.description}>
                <select
                  value={messageReturnStructure}
                  onChange={(e) => setMessageReturnStructure(e.target.value as ProfileDraft["messageReturnStructure"])}
                >
                  {MESSAGE_RETURN_STRUCTURE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-5 text-console-subtle">
                  Bridge 会按所选结构抽取请求消息并包装响应；自定义 JSON 和映射 SSE 仍以模板配置优先。
                </p>
                {selectedMessageReturnStructure?.routeRequired && <Pill tone="warning">需开启路由转换</Pill>}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={goBack}>上一步</Button>
                <Button type="button" onClick={generateDraft}>下一步</Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="grid gap-4">
              <div>
                <h3 className="text-base font-bold text-console-strong">配置完成</h3>
                <p className="mt-1 text-sm leading-6 text-console-subtle">保存前确认最终配置；测试代理不会持久化草稿 Profile。</p>
              </div>
              {draft && (
                <dl className="grid gap-2 rounded-console border border-console-border bg-console-muted p-3 text-sm">
                  <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">名称</dt><dd className="truncate">{draft.name}</dd></div>
                  <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">目标</dt><dd className="truncate">{draft.targetOrigin}{draft.targetPath}</dd></div>
                  <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">AI 工具</dt><dd>{provider === "claude" ? "Claude Code" : "Codex"}</dd></div>
                  <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">返回格式</dt><dd>{responseMode}</dd></div>
                  <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">消息结构</dt><dd>{MESSAGE_RETURN_STRUCTURE_OPTIONS.find((option) => option.value === draft.messageReturnStructure)?.label ?? draft.messageReturnStructure}</dd></div>
                </dl>
              )}
              {testResult && (
                <div className={cx("grid gap-2 rounded-console border p-3", testResult.ok ? "border-[rgba(22,130,85,0.28)] bg-console-success-soft" : "border-[rgba(184,50,50,0.28)] bg-console-danger-soft")}>
                  <div className="flex items-center gap-2">
                    <StatusDot tone={testResult.ok ? "success" : "danger"} />
                    <strong className="text-sm text-console-strong">{testResult.ok ? "测试通过" : "测试未通过"}</strong>
                  </div>
                  <ul className="grid gap-1 p-0 text-sm">
                    {testResult.stages.map((stage, i) => (
                      <li key={i} className="break-anywhere text-console-text">{stage.id}: {stage.message ?? stage.status}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={goBack}>上一步</Button>
                {!testResult && draft && <Button type="button" variant="secondary" onClick={() => void runTest()}>测试代理</Button>}
                <Button type="button" onClick={() => void saveAndTest()}>保存</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
