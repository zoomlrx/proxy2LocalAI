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
      <p className="muted">选择预设模板快速配置返回格式。选择后可在专家配置中进一步自定义。</p>
      <div className="template-grid">
        {BUILTIN_RESPONSE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`template-card ${draft.responseTemplateId === template.id ? "selected" : ""}`}
            onClick={() => onSelect(template.id)}
          >
            <div className="template-card-header">
              <strong>{template.name}</strong>
              <span className="template-mode">{template.responseMode}</span>
            </div>
            <p className="template-desc">{template.description}</p>
            <details className="template-preview">
              <summary>示例预览</summary>
              <pre>{template.examplePreview}</pre>
            </details>
          </button>
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
