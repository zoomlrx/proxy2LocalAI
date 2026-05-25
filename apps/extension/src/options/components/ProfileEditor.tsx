import React, { useCallback, useState } from "react";
import { inferResponseTemplateFromSample, type HttpMethod } from "@proxy2localai/shared";
import type { ProfileDraft, ProfileSection } from "../profileForm";
import { applyResponseModeToDraft, applyTemplateToDraft, getDefaultExpandedSections } from "../profileForm";
import { ResponseTemplatePicker } from "./ResponseTemplatePicker";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface ProfileEditorProps {
  draft: ProfileDraft;
  curlText: string;
  selectedProfile: { id: string } | null;
  onChangeDraft: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void;
  onChangeCurlText: (value: string) => void;
  onFillFromCurl: () => void;
  onOpenPathDialog: () => void;
  onSave: () => void;
  onDelete: () => void;
  onTestProvider?: () => void;
  testResult?: { ok: boolean; stages?: Array<{ id: string; status: string; message?: string }>; error?: string; output?: string | null } | null;
}

function SectionToggle({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="section-toggle" onClick={onToggle}>
      <span>{expanded ? "▼" : "▶"}</span> {title}
    </button>
  );
}

export function ProfileEditor({
  draft, curlText, selectedProfile,
  onChangeDraft, onChangeCurlText, onFillFromCurl, onOpenPathDialog, onSave, onDelete,
  onTestProvider, testResult
}: ProfileEditorProps) {
  const [expandedSections, setExpandedSections] = useState<ProfileSection[]>(
    () => getDefaultExpandedSections(draft.setupMode)
  );

  const toggleSection = (section: ProfileSection) => {
    setExpandedSections((current) =>
      current.includes(section)
        ? current.filter((s) => s !== section)
        : [...current, section]
    );
  };

  const isExpanded = (section: ProfileSection) => expandedSections.includes(section);

  const toggleMethod = (method: HttpMethod) => {
    const hasMethod = draft.methods.includes(method);
    const nextMethods = hasMethod
      ? draft.methods.filter((item) => item !== method)
      : [...draft.methods, method];
    onChangeDraft("methods", (nextMethods.length ? nextMethods : [method]) as ProfileDraft["methods"]);
  };

  const handleTemplateSelect = useCallback((templateId: string) => {
    const next = applyTemplateToDraft(draft, templateId);
    for (const key of Object.keys(next) as Array<keyof ProfileDraft>) {
      if (next[key] !== draft[key]) {
        onChangeDraft(key, next[key]);
      }
    }
  }, [draft, onChangeDraft]);

  const handleInferFromSample = useCallback((sample: string) => {
    const inferred = inferResponseTemplateFromSample(sample);
    if (inferred.responseMode !== draft.responseMode) {
      onChangeDraft("responseMode", inferred.responseMode);
    }
    if (inferred.suggestedTemplateId !== draft.responseTemplateId) {
      onChangeDraft("responseTemplateId", inferred.suggestedTemplateId);
    }
    if (inferred.sseEventMappings) {
      const mappingText = inferred.sseEventMappings
        .map((m) => `${m.source}=${m.targetEvent}`)
        .join("\n");
      onChangeDraft("sseEventMappings", mappingText);
    }
    if (inferred.customJsonTemplate) {
      onChangeDraft("customJsonTemplate", inferred.customJsonTemplate);
    }
  }, [draft, onChangeDraft]);

  const handleResponseModeChange = useCallback((responseMode: ProfileDraft["responseMode"]) => {
    const next = applyResponseModeToDraft(draft, responseMode);
    for (const key of Object.keys(next) as Array<keyof ProfileDraft>) {
      if (next[key] !== draft[key]) {
        onChangeDraft(key, next[key]);
      }
    }
  }, [draft, onChangeDraft]);

  return (
    <form className="editor" onSubmit={(event) => {
      event.preventDefault();
      onSave();
    }}>
      <section className="curl-panel">
        <label>
          粘贴 cURL 配置
          <textarea
            value={curlText}
            placeholder="curl 'https://api.example.com/v1/chat/completions' -X POST --data-raw '{...}'"
            onChange={(event) => onChangeCurlText(event.target.value)}
          />
        </label>
        <button type="button" onClick={onFillFromCurl}>从 cURL 填充</button>
      </section>

      {/* 基础配置 */}
      <SectionToggle title="基础配置" expanded={isExpanded("basic")} onToggle={() => toggleSection("basic")} />
      {isExpanded("basic") && (
        <section className="config-section basic">
          <div className="grid two">
            <label>名称<input value={draft.name} onChange={(e) => onChangeDraft("name", e.target.value)} /></label>
            <label>AI Provider
              <select value={draft.provider} onChange={(e) => onChangeDraft("provider", e.target.value as ProfileDraft["provider"])}>
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => onChangeDraft("enabled", e.target.checked)} />
            启用此代理
          </label>
          <div className="grid two">
            <label>目标地址<input value={draft.targetOrigin} onChange={(e) => onChangeDraft("targetOrigin", e.target.value)} /></label>
            <label>目标接口<input value={draft.targetPath} onChange={(e) => onChangeDraft("targetPath", e.target.value)} /></label>
          </div>
          <fieldset>
            <legend>HTTP 方法</legend>
            <div className="segmented">
              {METHODS.map((method) => (
                <label key={method}>
                  <input type="checkbox" checked={draft.methods.includes(method)} onChange={() => toggleMethod(method)} />
                  <span>{method}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid two">
            <label>返回类型
              <select value={draft.responseMode} onChange={(e) => handleResponseModeChange(e.target.value as ProfileDraft["responseMode"])}>
                <option value="block">普通 JSON</option>
                <option value="stream">流式 SSE</option>
                <option value="custom_json">自定义 JSON</option>
                <option value="mapped_sse">映射 SSE</option>
              </select>
            </label>
            <label>本地 AI 配置项目路径
              <input readOnly value={draft.projectDir} placeholder="点击选择或粘贴本地绝对路径" onClick={onOpenPathDialog} onFocus={onOpenPathDialog} />
            </label>
          </div>
          <label>提示词
            <textarea value={draft.prompt} onChange={(e) => onChangeDraft("prompt", e.target.value)} />
          </label>
          <details className="inline-details">
            <summary>返回模板</summary>
            <ResponseTemplatePicker draft={draft} onSelect={handleTemplateSelect} onInferFromSample={handleInferFromSample} />
          </details>
        </section>
      )}

      {/* 高级配置 */}
      <SectionToggle title="高级配置" expanded={isExpanded("advanced")} onToggle={() => toggleSection("advanced")} />
      {isExpanded("advanced") && (
        <section className="config-section advanced">
          <div className="grid two">
            <label className="check">
              <input type="checkbox" checked={draft.enableConversationMemory} onChange={(e) => onChangeDraft("enableConversationMemory", e.target.checked)} />
              启用多轮上下文记忆
            </label>
          </div>
          <div className="grid two">
            <label>超时 ms
              <input type="number" min="0" value={draft.timeoutMs} onChange={(e) => onChangeDraft("timeoutMs", Number(e.target.value))} />
              <small>0 表示不限时。</small>
            </label>
            <label>请求体上限 bytes（0 表示不限）
              <input type="number" min="0" value={draft.maxBodyBytes} onChange={(e) => onChangeDraft("maxBodyBytes", Number(e.target.value))} />
            </label>
          </div>
          <section className="custom-json-panel">
            <label>接口参数上下文正则
              <textarea value={draft.contextRegex} placeholder={'"messages"\\s*:\\s*(\\[[\\s\\S]*?\\])'} onChange={(e) => onChangeDraft("contextRegex", e.target.value)} />
              <small>对请求参数 JSON 执行；存在捕获组时使用第一个捕获组，留空则使用完整参数。</small>
            </label>
            <label>正则标记
              <input value={draft.contextRegexFlags} placeholder="s" onChange={(e) => onChangeDraft("contextRegexFlags", e.target.value)} />
            </label>
          </section>
        </section>
      )}

      {/* 专家配置 */}
      <SectionToggle title="专家配置" expanded={isExpanded("expert")} onToggle={() => toggleSection("expert")} />
      {isExpanded("expert") && (
        <section className="config-section expert">
          <p className="risk-note">专家配置可能执行本地命令、改变响应协议或暴露本地路径。只在明确知道目标接口需要时修改。</p>
          <div className="grid two">
            <label>配置 ID<input value={draft.id} onChange={(e) => onChangeDraft("id", e.target.value)} /></label>
            <label className="check">
              <input type="checkbox" checked={draft.allowDangerousCli} onChange={(e) => onChangeDraft("allowDangerousCli", e.target.checked)} />
              允许高风险 CLI 参数
            </label>
          </div>
          {draft.provider !== "custom" && draft.allowDangerousCli && (
            <p className="risk-note">已允许高风险 CLI 参数，请确认追加参数不会越权访问本机文件或执行非预期命令。</p>
          )}
          {draft.provider !== "custom" && (
            <section className="custom-json-panel">
              <label>AI 工具追加参数
                <textarea
                  value={draft.providerArgs}
                  disabled={!draft.allowDangerousCli}
                  placeholder="--debug"
                  onChange={(e) => onChangeDraft("providerArgs", e.target.value)}
                />
                <small>每行一个参数。该字段仅在“允许高风险 CLI 参数”开启时生效。</small>
              </label>
            </section>
          )}
          {draft.provider === "custom" && (
            <div className="grid two">
              <label>Custom 命令<input value={draft.customCommand} onChange={(e) => onChangeDraft("customCommand", e.target.value)} /></label>
              <label>Custom 参数<textarea value={draft.customArgs} onChange={(e) => onChangeDraft("customArgs", e.target.value)} /></label>
            </div>
          )}
          {draft.responseMode === "custom_json" && (
            <section className="custom-json-panel">
              <label>提取 SSE 事件名
                <textarea value={draft.sseDataEvents} placeholder="message" onChange={(e) => onChangeDraft("sseDataEvents", e.target.value)} />
                <small>每行或逗号分隔一个事件名，默认 message。</small>
              </label>
              <label>JSON 返回模板
                <textarea value={draft.customJsonTemplate} placeholder='{ "code": 0, "data": <aiData/> }' onChange={(e) => onChangeDraft("customJsonTemplate", e.target.value)} />
                <small>使用 &lt;aiData/&gt; 表示聚合后的端侧 AI 数据；留空则直接返回 AI 数据。</small>
              </label>
            </section>
          )}
          {draft.responseMode === "mapped_sse" && (
            <section className="custom-json-panel">
              <label>SSE 事件映射
                <textarea value={draft.sseEventMappings} placeholder={"reasoning=reasoning\nmessage=message"} onChange={(e) => onChangeDraft("sseEventMappings", e.target.value)} />
                <small>每行一个 source=targetEvent；只返回已映射的 provider 事件。</small>
              </label>
              <label>done 事件 JSON
                <textarea value={draft.sseDoneEvent} placeholder='{"conversationId":"","status":"completed"}' onChange={(e) => onChangeDraft("sseDoneEvent", e.target.value)} />
                <small>请求结束时作为 event:done 的 data 返回。</small>
              </label>
            </section>
          )}
        </section>
      )}

      {testResult && (
        <div className={`test-result ${testResult.ok ? "ok" : "error"}`}>
          <strong>{testResult.ok ? "测试通过" : "测试失败"}</strong>
          {testResult.error && <p>{testResult.error}</p>}
          {testResult.stages && (
            <ul>
              {testResult.stages.map((stage, i) => (
                <li key={i} className={stage.status}>{stage.id}: {stage.message ?? stage.status}</li>
              ))}
            </ul>
          )}
          {testResult.output && <details><summary>输出预览</summary><pre>{testResult.output}</pre></details>}
        </div>
      )}

      <div className="actions editor-actions">
        <button type="submit">保存配置</button>
        {selectedProfile && onTestProvider && (
          <button type="button" className="secondary" onClick={onTestProvider} title="发送最小 prompt 测试 provider 是否能工作（消耗模型额度）">
            测试 Provider
          </button>
        )}
      </div>

      <section className="danger-zone">
        <div>
          <strong>危险操作</strong>
          <p>删除后需要重新创建 Profile 才能恢复代理。</p>
        </div>
        <button type="button" className="danger" disabled={!selectedProfile} onClick={onDelete}>删除配置</button>
      </section>
      {selectedProfile && onTestProvider && (
        <small className="muted">测试 Provider 会发送最小 prompt，可能消耗模型额度。</small>
      )}
    </form>
  );
}
