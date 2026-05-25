import React, { useCallback, useState } from "react";
import { parseCurlCommand, type AppConfig } from "@proxy2localai/shared";
import { getBridgeHealth, testBridgeProfileDraft } from "../../lib/bridgeApi";
import type { CurlSummary, ProfileDraft } from "../profileForm";
import { createWizardProfileFromCurl, draftToProfile, getRecommendedTemplateId, summarizeCurlCommand, upsertProfile } from "../profileForm";

type WizardStep = "bridge" | "curl" | "ai" | "path" | "format" | "done";

interface CreateProxyWizardProps {
  config: AppConfig;
  onComplete: (config: AppConfig, options?: { keepOpen?: boolean }) => void | Promise<void>;
  onCancel: () => void;
  setStatus: (status: string) => void;
}

export function CreateProxyWizard({ config, onComplete, onCancel, setStatus }: CreateProxyWizardProps) {
  const [step, setStep] = useState<WizardStep>("bridge");
  const [curlText, setCurlText] = useState("");
  const [projectDir, setProjectDir] = useState(config.profiles[0]?.projectDir ?? "");
  const [provider, setProvider] = useState<"claude" | "codex">("claude");
  const [responseMode, setResponseMode] = useState<"stream" | "block" | "custom_json" | "mapped_sse">("stream");
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; stages: Array<{ id: string; status: string; message?: string }> } | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [curlSummary, setCurlSummary] = useState<CurlSummary | null>(null);

  const STEPS: WizardStep[] = ["bridge", "curl", "ai", "path", "format", "done"];

  const stepIndex = STEPS.indexOf(step);

  const goNext = useCallback(() => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  }, [stepIndex]);

  const goBack = useCallback(() => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }, [stepIndex]);

  // Step: Bridge 状态检查
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

  // Step: 解析 cURL
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

  // Step: 生成 draft
  const generateDraft = useCallback(() => {
    try {
      const wizardDraft = createWizardProfileFromCurl(curlText, projectDir);
      wizardDraft.provider = provider;
      wizardDraft.responseMode = responseMode;
      wizardDraft.responseTemplateId = getRecommendedTemplateId(responseMode);
      setDraft(wizardDraft);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建配置失败");
    }
  }, [curlText, projectDir, provider, responseMode, setStatus]);

  // Step: 保存并同步
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

  // Step: 测试代理
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
    <div className="modal-backdrop" role="presentation">
      <section className="modal wizard" role="dialog" aria-modal="true" aria-label="创建代理配置向导">
        <div className="wizard-header">
          <h2>创建代理配置</h2>
          <div className="wizard-steps">
            {STEPS.map((s, i) => (
              <span key={s} className={i <= stepIndex ? "step active" : "step"}>{i + 1}</span>
            ))}
          </div>
        </div>

        <div className="wizard-body">
          {curlSummary && step !== "bridge" && step !== "curl" && (
            <dl className="wizard-summary wizard-request-summary">
              <div><dt>域名</dt><dd>{curlSummary.origin}</dd></div>
              <div><dt>路径</dt><dd>{curlSummary.path}</dd></div>
              <div><dt>方法</dt><dd>{curlSummary.method}</dd></div>
              <div><dt>请求体</dt><dd>{curlSummary.bodySummary}</dd></div>
              <div><dt>流式</dt><dd>{curlSummary.stream ? "是" : "否"}</dd></div>
            </dl>
          )}
          {step === "bridge" && (
            <div className="wizard-step">
              <h3>检查 Bridge 服务</h3>
              <p>Bridge 是连接浏览器和本地 AI 工具的桥梁。请确保它正在运行。</p>
              {bridgeOnline === false && (
                <div className="wizard-error">
                  <p>Bridge 未连接，请先启动：</p>
                  <code>npm run start:bridge</code>
                  <p>或使用启动脚本：</p>
                  <code>.\scripts\start-bridge.ps1</code>（Windows）
                  <code>./scripts/start-bridge.sh</code>（macOS/Linux）
                </div>
              )}
              <div className="actions">
                <button type="button" className="secondary" onClick={onCancel}>取消</button>
                <button type="button" onClick={() => void checkBridge()}>检查 Bridge</button>
              </div>
            </div>
          )}

          {step === "curl" && (
            <div className="wizard-step">
              <h3>粘贴 API 请求</h3>
              <p>在浏览器开发者工具中，找到要代理的 API 请求，右键复制为 cURL，粘贴到下方。</p>
              <textarea
                value={curlText}
                placeholder="curl 'https://api.example.com/v1/chat/completions' -H 'content-type: application/json' --data-raw '{...}'"
                onChange={(e) => setCurlText(e.target.value)}
                rows={6}
              />
              {curlSummary && (
                <dl className="wizard-summary">
                  <div><dt>域名</dt><dd>{curlSummary.origin}</dd></div>
                  <div><dt>路径</dt><dd>{curlSummary.path}</dd></div>
                  <div><dt>方法</dt><dd>{curlSummary.method}</dd></div>
                  <div><dt>请求体</dt><dd>{curlSummary.bodySummary}</dd></div>
                  <div><dt>流式</dt><dd>{curlSummary.stream ? "是" : "否"}</dd></div>
                </dl>
              )}
              <div className="actions">
                <button type="button" className="secondary" onClick={goBack}>上一步</button>
                <button type="button" onClick={parseCurl}>下一步</button>
              </div>
            </div>
          )}

          {step === "ai" && (
            <div className="wizard-step">
              <h3>选择本地 AI 工具</h3>
              <p>选择用于生成响应的本地 AI 命令行工具。</p>
              <div className="wizard-options">
                <label className={`wizard-option ${provider === "claude" ? "selected" : ""}`}>
                  <input type="radio" name="provider" checked={provider === "claude"} onChange={() => setProvider("claude")} />
                  <strong>Claude Code</strong>
                  <small>Anthropic 官方 CLI 工具</small>
                </label>
                <label className={`wizard-option ${provider === "codex" ? "selected" : ""}`}>
                  <input type="radio" name="provider" checked={provider === "codex"} onChange={() => setProvider("codex")} />
                  <strong>Codex CLI</strong>
                  <small>OpenAI Codex 命令行工具</small>
                </label>
              </div>
              <div className="actions">
                <button type="button" className="secondary" onClick={goBack}>上一步</button>
                <button type="button" onClick={goNext}>下一步</button>
              </div>
            </div>
          )}

          {step === "path" && (
            <div className="wizard-step">
              <h3>选择项目路径</h3>
              <p>AI 工具将在此目录下启动。请输入本地项目的绝对路径。</p>
              <input
                value={projectDir}
                placeholder="C:/project/demoProject/proxy2LocalAI"
                onChange={(e) => setProjectDir(e.target.value)}
              />
              <div className="actions">
                <button type="button" className="secondary" onClick={goBack}>上一步</button>
                <button type="button" onClick={goNext} disabled={!projectDir.trim()}>下一步</button>
              </div>
            </div>
          )}

          {step === "format" && (
            <div className="wizard-step">
              <h3>选择返回格式</h3>
              <p>选择代理返回给浏览器的响应格式。</p>
              <div className="wizard-options">
                <label className={`wizard-option ${responseMode === "stream" ? "selected" : ""}`}>
                  <input type="radio" name="format" checked={responseMode === "stream"} onChange={() => setResponseMode("stream")} />
                  <strong>流式 SSE{curlSummary?.stream !== false ? "（推荐）" : ""}</strong>
                  <small>逐字流式返回，适合聊天场景</small>
                </label>
                <label className={`wizard-option ${responseMode === "block" ? "selected" : ""}`}>
                  <input type="radio" name="format" checked={responseMode === "block"} onChange={() => setResponseMode("block")} />
                  <strong>普通 JSON{curlSummary?.stream === false ? "（推荐）" : ""}</strong>
                  <small>等待完整响应后返回</small>
                </label>
                <label className={`wizard-option ${responseMode === "mapped_sse" ? "selected" : ""}`}>
                  <input type="radio" name="format" checked={responseMode === "mapped_sse"} onChange={() => setResponseMode("mapped_sse")} />
                  <strong>映射 SSE</strong>
                  <small>映射 provider 事件到自定义 SSE 事件</small>
                </label>
                <label className={`wizard-option ${responseMode === "custom_json" ? "selected" : ""}`}>
                  <input type="radio" name="format" checked={responseMode === "custom_json"} onChange={() => setResponseMode("custom_json")} />
                  <strong>自定义 JSON</strong>
                  <small>使用 JSON 模板包装 AI 数据</small>
                </label>
              </div>
              <div className="actions">
                <button type="button" className="secondary" onClick={goBack}>上一步</button>
                <button type="button" onClick={() => { generateDraft(); goNext(); }}>下一步</button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="wizard-step">
              <h3>配置完成</h3>
              {draft && (
                <dl className="wizard-summary">
                  <div><dt>名称</dt><dd>{draft.name}</dd></div>
                  <div><dt>目标</dt><dd>{draft.targetOrigin}{draft.targetPath}</dd></div>
                  <div><dt>AI 工具</dt><dd>{provider === "claude" ? "Claude Code" : "Codex"}</dd></div>
                  <div><dt>返回格式</dt><dd>{responseMode}</dd></div>
                </dl>
              )}
              {testResult && (
                <div className={`wizard-test-result ${testResult.ok ? "ok" : "error"}`}>
                  <strong>{testResult.ok ? "测试通过" : "测试未通过"}</strong>
                  <ul>
                    {testResult.stages.map((stage, i) => (
                      <li key={i} className={stage.status}>{stage.id}: {stage.message ?? stage.status}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="actions">
                <button type="button" className="secondary" onClick={goBack}>上一步</button>
                {!testResult && draft && (
                  <button type="button" onClick={() => void runTest()}>测试代理</button>
                )}
                <button type="button" onClick={() => void saveAndTest()}>保存</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
