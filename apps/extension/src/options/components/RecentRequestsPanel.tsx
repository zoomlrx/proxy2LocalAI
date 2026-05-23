import React, { useCallback, useEffect, useState } from "react";
import type { AppConfig, RequestDiagnosticDetail, RequestDiagnosticSummary } from "@proxy2localai/shared";
import { exportDiagnostic, getDiagnosticDetail, getRecentDiagnostics } from "../../lib/bridgeApi";

interface RecentRequestsPanelProps {
  config: AppConfig;
  setStatus: (status: string) => void;
}

export function RecentRequestsPanel({ config, setStatus }: RecentRequestsPanelProps) {
  const [items, setItems] = useState<RequestDiagnosticSummary[]>([]);
  const [detail, setDetail] = useState<RequestDiagnosticDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRecentDiagnostics(config);
      setItems(result.items);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "获取诊断记录失败");
    } finally {
      setLoading(false);
    }
  }, [config, setStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const viewDetail = useCallback(async (requestId: string) => {
    try {
      const result = await getDiagnosticDetail(config, requestId);
      setDetail(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "获取详情失败");
    }
  }, [config, setStatus]);

  const copyDiagnostic = useCallback(async (requestId: string) => {
    try {
      const text = await exportDiagnostic(config, requestId);
      await navigator.clipboard.writeText(text);
      setStatus("诊断信息已复制到剪贴板");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "复制失败");
    }
  }, [config, setStatus]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <section className="diagnostics-panel">
      <div className="diagnostics-header">
        <strong>最近请求</strong>
        <button type="button" className="secondary" onClick={refresh} disabled={loading}>
          {loading ? "加载中" : "刷新"}
        </button>
      </div>

      {items.length === 0 && !loading && (
        <p className="muted">暂无请求记录。发起代理请求后将在此显示。</p>
      )}

      <ul className="diagnostics-list">
        {items.map((item) => (
          <li key={item.id} className={`diagnostic-item ${item.finalStatus}`}>
            <div className="diagnostic-item-row" onClick={() => void viewDetail(item.id)}>
              <div>
                <span className="diagnostic-method">{item.method}</span>
                <span className="diagnostic-url">{item.targetUrl}</span>
              </div>
              <div>
                <small>{item.profileId ?? "-"}</small>
                <small>{formatTime(item.startedAt)}</small>
                <small>{formatDuration(item.duration)}</small>
                <span className={`diagnostic-status ${item.finalStatus}`}>{item.finalStatus}</span>
              </div>
            </div>
            {item.errorStage && <small className="diagnostic-error">失败于: {item.errorStage}</small>}
          </li>
        ))}
      </ul>

      {detail && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetail(null)}>
          <section className="modal diagnostic-detail" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>请求详情</h3>
            <dl className="diagnostic-meta">
              <div><dt>请求 ID</dt><dd>{detail.summary.id}</dd></div>
              <div><dt>方法</dt><dd>{detail.summary.method}</dd></div>
              <div><dt>目标</dt><dd>{detail.summary.targetUrl}</dd></div>
              <div><dt>Profile</dt><dd>{detail.summary.profileId ?? "-"}</dd></div>
              <div><dt>状态</dt><dd>{detail.summary.finalStatus}</dd></div>
              <div><dt>耗时</dt><dd>{formatDuration(detail.summary.duration)}</dd></div>
              {detail.summary.errorStage && (
                <div><dt>失败阶段</dt><dd>{detail.summary.errorStage}</dd></div>
              )}
            </dl>

            <h4>阶段记录</h4>
            <ul className="stage-list">
              {detail.stages.map((stage, index) => (
                <li key={index} className={`stage-item ${stage.status}`}>
                  <span className="stage-id">{stage.id}</span>
                  <span className={`stage-status ${stage.status}`}>{stage.status}</span>
                  {stage.message && <small className="stage-message">{stage.message}</small>}
                  {stage.duration !== undefined && <small className="stage-duration">{formatDuration(stage.duration)}</small>}
                </li>
              ))}
            </ul>

            <div className="actions">
              <button type="button" onClick={() => void copyDiagnostic(detail.summary.id)}>复制诊断信息</button>
              <button type="button" className="secondary" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
