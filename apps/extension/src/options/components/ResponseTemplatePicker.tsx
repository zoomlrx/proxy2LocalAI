import React from "react";
import { Wand2 } from "lucide-react";
import type { ProfileDraft } from "../profileForm";
import { getRecommendedTemplateCards } from "../profileForm";
import { Button, Pill, cx } from "../../ui/components";

interface ResponseTemplatePickerProps {
  draft: ProfileDraft;
  onSelect: (templateId: string) => void;
  onInferFromSample?: (sample: string) => void;
}

const responseModeLabels: Record<ProfileDraft["responseMode"], string> = {
  block: "普通 JSON",
  stream: "OpenAI SSE",
  custom_json: "自定义 JSON",
  mapped_sse: "映射 SSE"
};

export function ResponseTemplatePicker({ draft, onSelect, onInferFromSample }: ResponseTemplatePickerProps) {
  const [sampleText, setSampleText] = React.useState("");
  const cards = getRecommendedTemplateCards(draft.responseMode);

  const handleInfer = () => {
    if (sampleText.trim() && onInferFromSample) {
      onInferFromSample(sampleText);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <strong className="text-sm text-console-strong">返回格式模板</strong>
        <p className="text-sm leading-6 text-console-subtle">基础流程只展示推荐模板；详情和样例默认折叠。</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((template) => (
          <article
            key={template.id}
            className={cx(
              "grid gap-3 rounded-console border bg-console-surface p-3",
              draft.responseTemplateId === template.id ? "border-console-primary shadow-[inset_0_0_0_1px_var(--color-console-primary)]" : "border-console-border"
            )}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="min-w-0">
                <strong className="block truncate text-sm text-console-strong">{template.name}</strong>
                <span className="text-xs text-console-subtle">{responseModeLabels[template.responseMode]}</span>
              </div>
              {template.recommended && <Pill tone="info">推荐</Pill>}
            </div>
            <p className="text-sm leading-6 text-console-subtle">{template.description}</p>
            <p className="text-xs leading-5 text-console-subtle">{template.recommendReason}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={draft.responseTemplateId === template.id ? "primary" : "secondary"}
                size="sm"
                onClick={() => onSelect(template.id)}
              >
                {draft.responseTemplateId === template.id ? "已选择" : "选择"}
              </Button>
            </div>
            <details className="rounded-console-sm border border-console-border bg-console-muted p-2">
              <summary className="cursor-pointer text-xs font-semibold text-console-text">详情和示例</summary>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-anywhere rounded-console-sm bg-console-surface p-2 font-mono text-xs text-console-text">
                {template.examplePreview}
              </pre>
            </details>
          </article>
        ))}
      </div>

      {onInferFromSample && (
        <div className="grid gap-3 rounded-console border border-console-border bg-console-muted p-3">
          <div className="grid gap-1">
            <strong className="text-sm text-console-strong">从响应样例推断</strong>
            <p className="text-sm leading-6 text-console-subtle">粘贴真实 API 响应样例，自动推断最佳模板。</p>
          </div>
          <textarea
            value={sampleText}
            placeholder={'event:message\ndata:"hello"\n\n或 {"code":0,"data":"hello"}'}
            onChange={(e) => setSampleText(e.target.value)}
            rows={3}
          />
          <div>
            <Button type="button" icon={<Wand2 size={16} aria-hidden="true" />} onClick={handleInfer} disabled={!sampleText.trim()}>
              推断模板
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
