import React, { useCallback, useEffect, useState } from "react";
import type { AppConfig, RequestDiagnosticDetail, RequestDiagnosticSummary } from "@proxy2localai/shared";
import { exportDiagnostic, getDiagnosticDetail, getRecentDiagnostics, testBridgeProfile } from "../../lib/bridgeApi";
import { formatDurationForDisplay, getDiagnosticStageLabel } from "../dashboardView";

interface RecentRequestsPanelProps {
  config: AppConfig;
  setStatus: (status: string) => void;
  onItemsChange?: (items: RequestDiagnosticSummary[]) => void;
}

export function RecentRequestsPanel({ config, setStatus, onItemsChange }: RecentRequestsPanelProps) {
  const [items, setItems] = useState<RequestDiagnosticSummary[]>([]);
  const [detail, setDetail] = useState<RequestDiagnosticDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRecentDiagnostics(config);
      setItems(result.items);
      onItemsChange?.(result.items);
    } catch (error) {
      setItems([]);
      onItemsChange?.([]);
      setStatus(error instanceof Error ? error.message : "获取诊断记录失败");
    } finally {
      setLoading(false);
    }
  }, [config, onItemsChange, setStatus]);

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

  const retryProfileTest = useCallback(async (profileId?: string) => {
    if (!profileId) {
      setStatus("该请求未匹配 Profile，无法重试测试");
      return;
    }
    try {
      const result = await testBridgeProfile(config, profileId, {
        headers: { "content-type": "application/json" },
        body: { messages: [{ role: "user", content: "ping" }] }
      });
      setStatus(result.ok ? "重试测试通过" : `重试测试失败：${result.stages.find((stage) => stage.status === "error")?.id ?? "unknown"}`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "重试测试失败");
    }
  }, [config, refresh, setStatus]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <section className="diagnostics-panel">
      <div className="diagnostics-header">
        <div>
          <strong>最近请求诊断台</strong>
          <p className="muted">定位 DNR、Bridge、Profile、Provider 和响应转换阶段。</p>
        </div>
        <button type="button" className="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? "加载中" : "刷新"}
        </button>
      </div>

      {items.length === 0 && !loading && (
        <p className="muted">暂无请求记录。发起代理请求后将在此显示。</p>
      )}

      {items.length > 0 && (
        <div className="diagnostics-table-wrap">
          <table className="diagnostics-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>方法</th>
                <th>目标接口</th>
                <th>Profile</th>
                <th>状态</th>
                <th>耗时</th>
                <th>失败阶段</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.finalStatus}>
                  <td title={formatTime(item.startedAt)}>{formatTime(item.startedAt)}</td>
                  <td><span className="diagnostic-method">{item.method}</span></td>
                  <td><span className="truncate-text" title={item.targetUrl}>{item.targetUrl}</span></td>
                  <td>{item.profileId ?? "-"}</td>
                  <td><span className={`diagnostic-status ${item.finalStatus}`}>{item.finalStatus}</span></td>
                  <td>{formatDurationForDisplay(item.duration)}</td>
                  <td>{getDiagnosticStageLabel(item.errorStage)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="secondary compact" onClick={() => void viewDetail(item.id)}>详情</button>
                      <button type="button" className="secondary compact" onClick={() => void copyDiagnostic(item.id)}>复制诊断</button>
                      <button type="button" className="secondary compact" onClick={() => void retryProfileTest(item.profileId)} disabled={!item.profileId}>重试</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetail(null)}>
          <section className="modal diagnostic-detail" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>请求详情</h3>
            <dl className="diagnostic-meta">
              <div><dt>请求 ID</dt><dd>{detail.summary.id}</dd></div>
              <div><dt>方法</dt><dd>{detail.summary.method}</dd></div>
              <div><dt>原始目标 URL</dt><dd className="break-text">{detail.summary.targetUrl}</dd></div>
              <div><dt>Bridge URL</dt><dd className="break-text">{detail.summary.profileId ? `${config.bridgeBaseUrl.replace(/\/$/, "")}/proxy/${encodeURIComponent(detail.summary.profileId)}` : "-"}</dd></div>
              <div><dt>Profile</dt><dd>{detail.summary.profileId ?? "-"}</dd></div>
              <div><dt>响应模式</dt><dd>{config.profiles.find((profile) => profile.id === detail.summary.profileId)?.responseMode ?? "-"}</dd></div>
              <div><dt>状态</dt><dd>{detail.summary.finalStatus}</dd></div>
              <div><dt>耗时</dt><dd>{formatDurationForDisplay(detail.summary.duration)}</dd></div>
              {detail.summary.errorStage && (
                <div><dt>失败阶段</dt><dd>{getDiagnosticStageLabel(detail.summary.errorStage)}（{detail.summary.errorStage}）</dd></div>
              )}
            </dl>

            <h4>阶段记录</h4>
            <ul className="stage-list">
              {detail.stages.map((stage, index) => (
                <li key={index} className={`stage-item ${stage.status}`}>
                  <span className="stage-id">{stage.id}</span>
                  <span className={`stage-status ${stage.status}`}>{stage.status}</span>
                  {stage.message && <small className="stage-message">{stage.message}</small>}
                  {stage.duration !== undefined && <small className="stage-duration">{formatDurationForDisplay(stage.duration)}</small>}
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
