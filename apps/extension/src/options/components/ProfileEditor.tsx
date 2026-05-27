import React, { useCallback, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FlaskConical, FolderOpen, Save, Trash2, Wand2 } from "lucide-react";
import { inferResponseTemplateFromSample, type HttpMethod } from "@proxy2localai/shared";
import type { ProfileDraft, ProfileSection } from "../profileForm";
import {
  applyResponseModeToDraft,
  applyTemplateToDraft,
  createStreamMappingPreview,
  getDefaultExpandedSections,
  inferStreamMappingFromSample,
  MESSAGE_RETURN_STRUCTURE_OPTIONS
} from "../profileForm";
import { ResponseTemplatePicker } from "./ResponseTemplatePicker";
import { Button, Field, Panel, Pill, ToggleSwitch, cx } from "../../ui/components";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const STREAM_MAPPING_TEMPLATE_IDS = [
  { id: "generic_chat_sse", label: "通用聊天" },
  { id: "chat_reasoning_sse", label: "推理过程" },
  { id: "tool_status_sse", label: "工具状态" },
  { id: "business_stream_sse", label: "业务协议" }
] as const;

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

function SectionToggle({ title, hint, expanded, onToggle, danger }: {
  title: string;
  hint: string;
  expanded: boolean;
  onToggle: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-console border px-3 py-3 text-left transition-colors",
        danger ? "border-[rgba(166,101,0,0.32)] bg-console-warning-soft" : "border-console-border bg-console-muted hover:bg-console-raised"
      )}
      onClick={onToggle}
    >
      {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
      <span className="min-w-0">
        <strong className="block truncate text-sm text-console-strong">{title}</strong>
        <small className="block truncate text-xs text-console-subtle">{hint}</small>
      </span>
      {danger && <Pill tone="warning">风险隔离</Pill>}
    </button>
  );
}

export function ProfileEditor({
  draft, curlText, selectedProfile,
  onChangeDraft, onChangeCurlText, onFillFromCurl, onOpenPathDialog, onSave, onDelete,
  onTestProvider, testResult
}: ProfileEditorProps) {
  const isCreating = !selectedProfile;
  const [expandedSections, setExpandedSections] = useState<ProfileSection[]>(
    () => getDefaultExpandedSections(draft.setupMode)
  );
  const [mappingSample, setMappingSample] = useState("");
  const mappingPreview = React.useMemo(() => createStreamMappingPreview(draft, {
    provider: draft.provider === "codex" ? "codex" : draft.provider === "custom" ? "custom" : "claude",
    eventId: "evt_preview_001",
    sequence: 1,
    kind: "delta",
    channel: "message",
    role: "assistant",
    content: "你好"
  }), [draft]);
  const selectedMessageReturnStructure = MESSAGE_RETURN_STRUCTURE_OPTIONS.find(
    (option) => option.value === draft.messageReturnStructure
  ) ?? MESSAGE_RETURN_STRUCTURE_OPTIONS[0];

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

  const handleInferStreamMapping = useCallback(() => {
    if (!mappingSample.trim()) {
      return;
    }
    const inferred = inferStreamMappingFromSample(mappingSample);
    onChangeDraft("streamMappings", JSON.stringify(inferred.streamMappings, null, 2));
    onChangeDraft("streamDoneEvent", JSON.stringify(inferred.streamDoneEvent, null, 2));
  }, [mappingSample, onChangeDraft]);

  const handleResponseModeChange = useCallback((responseMode: ProfileDraft["responseMode"]) => {
    const next = applyResponseModeToDraft(draft, responseMode);
    for (const key of Object.keys(next) as Array<keyof ProfileDraft>) {
      if (next[key] !== draft[key]) {
        onChangeDraft(key, next[key]);
      }
    }
  }, [draft, onChangeDraft]);

  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      onSave();
    }}>
      <Panel className="grid gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-console-strong">配置编辑</h2>
            <p className="mt-1 text-sm leading-6 text-console-subtle">优先维护基础字段；高级和专家项按需展开。</p>
          </div>
          <Pill tone={draft.enabled ? "success" : "default"}>{draft.enabled ? "启用" : "停用"}</Pill>
        </div>

        {isCreating && (
          <div className="grid gap-3 rounded-console border border-console-border bg-console-muted p-3">
            <Field label="粘贴 cURL 配置">
              <textarea
                value={curlText}
                placeholder="curl 'https://api.example.com/v1/chat/completions' -X POST --data-raw '{...}'"
                onChange={(event) => onChangeCurlText(event.target.value)}
              />
            </Field>
            <div>
              <Button type="button" variant="secondary" icon={<Wand2 size={16} aria-hidden="true" />} onClick={onFillFromCurl}>
                从 cURL 填充
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <SectionToggle title="基础配置" hint="新用户默认只需要维护这些字段" expanded={isExpanded("basic")} onToggle={() => toggleSection("basic")} />
      {isExpanded("basic") && (
        <Panel className="grid gap-4 bg-console-muted">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="名称">
              <input value={draft.name} onChange={(e) => onChangeDraft("name", e.target.value)} />
            </Field>
            <Field label="AI Provider">
              <select value={draft.provider} onChange={(e) => onChangeDraft("provider", e.target.value as ProfileDraft["provider"])}>
                <option value="claude">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 rounded-console-sm border border-console-border bg-console-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <strong className="block text-sm text-console-strong">启用此代理</strong>
              <small className="mt-1 block text-xs leading-5 text-console-subtle">
                关闭后会保留配置，但不会生成浏览器代理规则。
              </small>
            </div>
            <ToggleSwitch
              checked={draft.enabled}
              aria-label={draft.enabled ? "停用此代理" : "启用此代理"}
              onClick={() => onChangeDraft("enabled", !draft.enabled)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="目标地址">
              <input value={draft.targetOrigin} onChange={(e) => onChangeDraft("targetOrigin", e.target.value)} />
            </Field>
            <Field label="目标接口">
              <input value={draft.targetPath} onChange={(e) => onChangeDraft("targetPath", e.target.value)} />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-console-text">HTTP 方法</legend>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((method) => (
                <label key={method} className="cursor-pointer">
                  <input className="peer sr-only" type="checkbox" checked={draft.methods.includes(method)} onChange={() => toggleMethod(method)} />
                  <span className="inline-flex min-h-9 items-center rounded-console-sm border border-console-border bg-console-surface px-3 font-mono text-xs font-bold text-console-text peer-checked:border-console-primary peer-checked:bg-console-primary-soft peer-focus-visible:shadow-[0_0_0_3px_rgba(15,107,95,0.2)]">
                    {method}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="返回类型">
              <select value={draft.responseMode} onChange={(e) => handleResponseModeChange(e.target.value as ProfileDraft["responseMode"])}>
                <option value="block">普通 JSON</option>
                <option value="stream">流式 SSE</option>
                <option value="custom_json">自定义 JSON</option>
                <option value="mapped_sse">映射 SSE</option>
              </select>
            </Field>
            <Field label="消息返回结构" hint={selectedMessageReturnStructure?.description}>
              <select
                value={draft.messageReturnStructure}
                onChange={(e) => onChangeDraft("messageReturnStructure", e.target.value as ProfileDraft["messageReturnStructure"])}
              >
                {MESSAGE_RETURN_STRUCTURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs leading-5 text-console-subtle">
                Bridge 会按所选结构抽取请求消息并包装响应；自定义 JSON 和映射 SSE 仍以模板配置优先。
              </p>
              {selectedMessageReturnStructure?.routeRequired && (
                <Pill tone="warning">需开启路由转换</Pill>
              )}
            </Field>
          </div>

          <div className="grid gap-3">
            <Field label="本地 AI 配置项目路径">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input readOnly value={draft.projectDir} placeholder="点击选择或粘贴本地绝对路径" onClick={onOpenPathDialog} onFocus={onOpenPathDialog} />
                <Button type="button" variant="secondary" size="icon" aria-label="选择本地 AI 配置项目路径" onClick={onOpenPathDialog}>
                  <FolderOpen size={16} aria-hidden="true" />
                </Button>
              </div>
            </Field>
          </div>

          <Field label="提示词">
            <textarea value={draft.prompt} onChange={(e) => onChangeDraft("prompt", e.target.value)} />
          </Field>

          <details className="rounded-console border border-console-border bg-console-surface p-3">
            <summary className="cursor-pointer text-sm font-bold text-console-strong">返回模板</summary>
            <div className="mt-3">
              <ResponseTemplatePicker draft={draft} onSelect={handleTemplateSelect} onInferFromSample={handleInferFromSample} />
            </div>
          </details>
        </Panel>
      )}

      <SectionToggle title="高级配置" hint="超时、体积上限、上下文提取和多轮记忆" expanded={isExpanded("advanced")} onToggle={() => toggleSection("advanced")} />
      {isExpanded("advanced") && (
        <Panel className="grid gap-4 bg-console-muted">
          <label className="flex items-center gap-2 text-sm font-semibold text-console-text">
            <input type="checkbox" checked={draft.enableConversationMemory} onChange={(e) => onChangeDraft("enableConversationMemory", e.target.checked)} />
            启用多轮上下文记忆
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="超时 ms" hint="0 表示不限时。">
              <input type="number" min="0" value={draft.timeoutMs} onChange={(e) => onChangeDraft("timeoutMs", Number(e.target.value))} />
            </Field>
            <Field label="请求体上限 bytes" hint="0 表示不限。">
              <input type="number" min="0" value={draft.maxBodyBytes} onChange={(e) => onChangeDraft("maxBodyBytes", Number(e.target.value))} />
            </Field>
          </div>
          <Field label="接口参数上下文正则" hint="对请求参数 JSON 执行；存在捕获组时使用第一个捕获组。">
            <textarea value={draft.contextRegex} placeholder={'"messages"\\s*:\\s*(\\[[\\s\\S]*?\\])'} onChange={(e) => onChangeDraft("contextRegex", e.target.value)} />
          </Field>
          <Field label="正则标记">
            <input value={draft.contextRegexFlags} placeholder="s" onChange={(e) => onChangeDraft("contextRegexFlags", e.target.value)} />
          </Field>
        </Panel>
      )}

      <SectionToggle title="专家配置" hint="本地命令、响应模板和高风险 CLI 参数" expanded={isExpanded("expert")} onToggle={() => toggleSection("expert")} danger />
      {isExpanded("expert") && (
        <Panel className="grid gap-4 border-[rgba(166,101,0,0.34)] bg-console-warning-soft">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-console border border-[rgba(166,101,0,0.3)] bg-console-surface p-3">
            <AlertTriangle size={18} className="mt-0.5 text-console-warning" aria-hidden="true" />
            <p className="text-sm leading-6 text-console-subtle">专家配置可能执行本地命令、改变响应协议或暴露本地路径。只在明确知道目标接口需要时修改。</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="配置 ID">
              <input value={draft.id} onChange={(e) => onChangeDraft("id", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-console-text">
              <input type="checkbox" checked={draft.allowDangerousCli} onChange={(e) => onChangeDraft("allowDangerousCli", e.target.checked)} />
              允许高风险 CLI 参数
            </label>
          </div>
          {draft.provider !== "custom" && (
            <Field label="AI 工具追加参数" hint="每行一个参数。该字段仅在“允许高风险 CLI 参数”开启时生效。">
              <textarea
                value={draft.providerArgs}
                disabled={!draft.allowDangerousCli}
                placeholder="--debug"
                onChange={(e) => onChangeDraft("providerArgs", e.target.value)}
              />
            </Field>
          )}
          {draft.provider === "custom" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Custom 命令">
                <input value={draft.customCommand} onChange={(e) => onChangeDraft("customCommand", e.target.value)} />
              </Field>
              <Field label="Custom 参数">
                <textarea value={draft.customArgs} onChange={(e) => onChangeDraft("customArgs", e.target.value)} />
              </Field>
            </div>
          )}
          {draft.responseMode === "custom_json" && (
            <div className="grid gap-3">
              <Field label="提取 SSE 事件名" hint="每行或逗号分隔一个事件名，默认 message。">
                <textarea value={draft.sseDataEvents} placeholder="message" onChange={(e) => onChangeDraft("sseDataEvents", e.target.value)} />
              </Field>
              <Field label="JSON 返回模板" hint="使用 <aiData/> 表示聚合后的端侧 AI 数据；留空则直接返回 AI 数据。">
                <textarea value={draft.customJsonTemplate} placeholder='{ "code": 0, "data": <aiData/> }' onChange={(e) => onChangeDraft("customJsonTemplate", e.target.value)} />
              </Field>
            </div>
          )}
          {draft.responseMode === "mapped_sse" && (
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-console border border-console-border bg-console-surface p-3">
                <strong className="text-sm text-console-strong">响应映射模板</strong>
                <div className="flex flex-wrap gap-2">
                  {STREAM_MAPPING_TEMPLATE_IDS.map((template) => (
                    <Button key={template.id} type="button" variant="secondary" size="sm" onClick={() => handleTemplateSelect(template.id)}>
                      {template.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Field label="Stream Codec" hint="把 provider 原始 JSONL 标准化为 message/reasoning/tool/status/error 等事件。">
                <select value={draft.streamCodec} onChange={(e) => onChangeDraft("streamCodec", e.target.value as ProfileDraft["streamCodec"])}>
                  <option value="claude-code-v1">Claude Code v1</option>
                  <option value="codex-cli-v1">Codex CLI v1</option>
                  <option value="custom-jsonl-v1">Custom JSONL v1</option>
                </select>
              </Field>

              <Field label="Stream Mappings JSON" hint="匹配标准事件并输出目标 SSE event/data；默认不允许 raw/data/tool.input/tool.output。">
                <textarea value={draft.streamMappings} rows={10} onChange={(e) => onChangeDraft("streamMappings", e.target.value)} />
              </Field>
              <Field label="Done Event JSON" hint="Provider 正常结束时追加的完成事件，格式为 { event, data }。">
                <textarea value={draft.streamDoneEvent} rows={4} onChange={(e) => onChangeDraft("streamDoneEvent", e.target.value)} />
              </Field>
              <div className="grid gap-2 rounded-console border border-console-border bg-console-surface p-3">
                <div className="grid gap-1">
                  <strong className="text-sm text-console-strong">SSE 预览</strong>
                  <span className="text-xs text-console-subtle">使用模拟 message 事件预览最终输出。</span>
                </div>
                {mappingPreview.ok ? (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-anywhere rounded-console-sm bg-console-muted p-3 font-mono text-xs text-console-text">{mappingPreview.output}</pre>
                ) : (
                  <p className="break-anywhere rounded-console-sm bg-console-danger-soft p-3 text-sm text-console-danger">{mappingPreview.error}</p>
                )}
              </div>
              <div className="grid gap-2 rounded-console border border-console-border bg-console-surface p-3">
                <Field label="从目标 SSE 样例推断">
                  <textarea
                    value={mappingSample}
                    rows={4}
                    placeholder={'event: chat\ndata: {"type":"answer.delta","content":"hello"}\n\nevent: finish\ndata: {"status":"completed"}'}
                    onChange={(e) => setMappingSample(e.target.value)}
                  />
                </Field>
                <div>
                  <Button type="button" variant="secondary" size="sm" icon={<Wand2 size={16} aria-hidden="true" />} disabled={!mappingSample.trim()} onClick={handleInferStreamMapping}>
                    推断映射
                  </Button>
                </div>
              </div>
              <details className="rounded-console border border-console-border bg-console-surface p-3">
                <summary className="cursor-pointer text-sm font-bold text-console-strong">旧版 source=event fallback</summary>
                <div className="mt-3 grid gap-3">
              <Field label="SSE 事件映射" hint="每行一个 source=targetEvent；只返回已映射的 provider 事件。">
                <textarea value={draft.sseEventMappings} placeholder={"reasoning=reasoning\nmessage=message"} onChange={(e) => onChangeDraft("sseEventMappings", e.target.value)} />
              </Field>
              <Field label="done 事件 JSON" hint="请求结束时作为 event:done 的 data 返回。">
                <textarea value={draft.sseDoneEvent} placeholder='{"conversationId":"","status":"completed"}' onChange={(e) => onChangeDraft("sseDoneEvent", e.target.value)} />
              </Field>
                </div>
              </details>
            </div>
          )}
        </Panel>
      )}

      {testResult && (
        <Panel className={cx("grid gap-2", testResult.ok ? "border-[rgba(22,130,85,0.28)] bg-console-success-soft" : "border-[rgba(184,50,50,0.28)] bg-console-danger-soft")}>
          <strong className="text-sm text-console-strong">{testResult.ok ? "测试通过" : "测试失败"}</strong>
          {testResult.error && <p className="break-anywhere text-sm leading-6 text-console-subtle">{testResult.error}</p>}
          {testResult.stages && (
            <ul className="grid gap-1 p-0 text-sm">
              {testResult.stages.map((stage, i) => (
                <li key={i} className="break-anywhere text-console-text">{stage.id}: {stage.message ?? stage.status}</li>
              ))}
            </ul>
          )}
          {testResult.output && <details><summary className="cursor-pointer font-semibold">输出预览</summary><pre className="mt-2 overflow-auto rounded-console-sm bg-console-surface p-3 text-xs">{testResult.output}</pre></details>}
        </Panel>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={<Save size={16} aria-hidden="true" />}>保存配置</Button>
        {selectedProfile && onTestProvider && (
          <Button type="button" variant="secondary" icon={<FlaskConical size={16} aria-hidden="true" />} onClick={onTestProvider} title="发送最小 prompt 测试 provider 是否能工作（消耗模型额度）">
            测试 Provider
          </Button>
        )}
      </div>

      <Panel className="grid gap-3 border-[rgba(184,50,50,0.28)] bg-console-danger-soft sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <strong className="text-sm text-console-strong">危险操作</strong>
          <p className="mt-1 text-sm leading-6 text-console-subtle">删除后需要重新创建 Profile 才能恢复代理。</p>
        </div>
        <Button type="button" variant="danger" disabled={!selectedProfile} icon={<Trash2 size={16} aria-hidden="true" />} onClick={onDelete}>
          删除配置
        </Button>
      </Panel>
      {selectedProfile && onTestProvider && (
        <small className="text-xs text-console-subtle">测试 Provider 会发送最小 prompt，可能消耗模型额度。</small>
      )}
    </form>
  );
}
