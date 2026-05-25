import React from "react";
import { BUILTIN_RESPONSE_TEMPLATES } from "@proxy2localai/shared";
import type { ProfileDraft } from "../profileForm";

interface ResponseTemplatePickerProps {
  draft: ProfileDraft;
  onSelect: (templateId: string) => void;
  onInferFromSample?: (sample: string) => void;
}

export function ResponseTemplatePicker({ draft, onSelect, onInferFromSample }: ResponseTemplatePickerProps) {
  const [sampleText, setSampleText] = React.useState("");

  const handleInfer = () => {
    if (sampleText.trim() && onInferFromSample) {
      onInferFromSample(sampleText);
    }
  };

  return (
    <section className="template-picker">
      <strong>返回格式模板</strong>
      <p className="muted">默认按返回类型推荐模板，详情和样例可展开查看。</p>
      <div className="template-grid">
        {BUILTIN_RESPONSE_TEMPLATES.map((template) => (
          <article
            key={template.id}
            className={`template-card ${draft.responseTemplateId === template.id ? "selected" : ""}`}
          >
            <div className="template-card-header">
              <strong>{template.name}</strong>
              <span className="template-mode">{template.responseMode}</span>
            </div>
            <p className="template-desc">{template.description}</p>
            <button
              type="button"
              className="secondary compact"
              onClick={() => onSelect(template.id)}
            >
              {draft.responseTemplateId === template.id ? "已选择" : "选择"}
            </button>
            <details className="template-preview">
              <summary>详情和示例</summary>
              <pre>{template.examplePreview}</pre>
            </details>
          </article>
        ))}
      </div>

      {onInferFromSample && (
        <div className="template-infer">
          <strong>从响应样例推断</strong>
          <p className="muted">粘贴真实的 API 响应样例，自动推断最佳模板。</p>
          <textarea
            value={sampleText}
            placeholder={'event:message\ndata:"hello"\n\n或 {"code":0,"data":"hello"}'}
            onChange={(e) => setSampleText(e.target.value)}
            rows={3}
          />
          <button type="button" onClick={handleInfer} disabled={!sampleText.trim()}>推断模板</button>
        </div>
      )}
    </section>
  );
}
