import React, { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, RotateCcw } from "lucide-react";
import type { AppConfig, RequestDiagnosticDetail, RequestDiagnosticSummary } from "@proxy2localai/shared";
import { exportDiagnostic, getDiagnosticDetail, getRecentDiagnostics, testBridgeProfile } from "../../lib/bridgeApi";
import { formatDurationForDisplay, getDiagnosticStageLabel } from "../dashboardView";
import { Button, ModalShell, Panel, Pill, StatusDot, cx } from "../../ui/components";

interface RecentRequestsPanelProps {
  config: AppConfig;
  setStatus: (status: string) => void;
  onItemsChange?: (items: RequestDiagnosticSummary[]) => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function getStatusTone(status: RequestDiagnosticSummary["finalStatus"]) {
  return status === "error" ? "danger" as const : status === "ok" ? "success" as const : "warning" as const;
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

  return (
    <Panel className="grid gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-console-strong">最近请求诊断台</h2>
          <p className="mt-1 text-sm leading-6 text-console-subtle">定位 DNR、Bridge、Profile、Provider 和响应转换阶段。</p>
        </div>
        <Button type="button" variant="secondary" size="sm" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => void refresh()} disabled={loading}>
          {loading ? "加载中" : "刷新"}
        </Button>
      </div>

      {items.length === 0 && !loading && (
        <div className="rounded-console border border-dashed border-console-border-strong bg-console-muted p-4">
          <strong className="text-sm text-console-strong">暂无请求记录</strong>
          <p className="mt-1 text-sm leading-6 text-console-subtle">发起代理请求后将在此显示；刷新失败时旧统计会被清空。</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-console-border font-bold text-console-subtle">
                <th className="py-3 pr-3">时间</th>
                <th className="py-3 pr-3">方法</th>
                <th className="min-w-48 py-3 pr-3">目标接口</th>
                <th className="py-3 pr-3">Profile</th>
                <th className="py-3 pr-3">状态</th>
                <th className="py-3 pr-3">耗时</th>
                <th className="py-3 pr-3">失败阶段</th>
                <th className="py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={cx("border-b border-console-border align-middle last:border-b-0", item.finalStatus === "error" && "bg-console-danger-soft/55")}>
                  <td className="max-w-36 truncate py-3 pr-3" title={formatTime(item.startedAt)}>{formatTime(item.startedAt)}</td>
                  <td className="py-3 pr-3"><span className="rounded bg-[#edf1f4] px-1.5 py-1 font-mono font-bold text-[#25333b]">{item.method}</span></td>
                  <td className="py-3 pr-3"><span className="block max-w-72 truncate" title={item.targetUrl}>{item.targetUrl}</span></td>
                  <td className="max-w-28 truncate py-3 pr-3">{item.profileId ?? "-"}</td>
                  <td className="py-3 pr-3"><Pill tone={getStatusTone(item.finalStatus)}>{item.finalStatus}</Pill></td>
                  <td className="py-3 pr-3">{formatDurationForDisplay(item.duration)}</td>
                  <td className="py-3 pr-3">{getDiagnosticStageLabel(item.errorStage)}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="secondary" size="sm" onClick={() => void viewDetail(item.id)}>详情</Button>
                      <Button type="button" variant="secondary" size="icon" aria-label="复制诊断" onClick={() => void copyDiagnostic(item.id)}>
                        <Copy size={14} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="secondary" size="icon" aria-label="重试测试" onClick={() => void retryProfileTest(item.profileId)} disabled={!item.profileId}>
                        <RotateCcw size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <ModalShell title="请求详情" className="max-w-3xl" onClose={() => setDetail(null)} closeLabel="关闭请求详情">
          <div className="grid gap-4">
            <dl className="grid gap-2 text-sm">
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">请求 ID</dt><dd className="break-anywhere">{detail.summary.id}</dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">方法</dt><dd>{detail.summary.method}</dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">原始目标 URL</dt><dd className="break-anywhere">{detail.summary.targetUrl}</dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">Bridge URL</dt><dd className="break-anywhere">{detail.summary.profileId ? `${config.bridgeBaseUrl.replace(/\/$/, "")}/proxy/${encodeURIComponent(detail.summary.profileId)}` : "-"}</dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">Profile</dt><dd>{detail.summary.profileId ?? "-"}</dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">响应模式</dt><dd>{config.profiles.find((profile) => profile.id === detail.summary.profileId)?.responseMode ?? "-"}</dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">状态</dt><dd><Pill tone={getStatusTone(detail.summary.finalStatus)}>{detail.summary.finalStatus}</Pill></dd></div>
              <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">耗时</dt><dd>{formatDurationForDisplay(detail.summary.duration)}</dd></div>
              {detail.summary.errorStage && (
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2"><dt className="font-semibold text-console-subtle">失败阶段</dt><dd>{getDiagnosticStageLabel(detail.summary.errorStage)}（{detail.summary.errorStage}）</dd></div>
              )}
            </dl>

            <section className="grid gap-2">
              <h3 className="text-sm font-bold text-console-strong">阶段记录</h3>
              <ul className="grid gap-2 p-0">
                {detail.stages.map((stage, index) => (
                  <li key={index} className="grid grid-cols-[10px_minmax(0,1fr)_auto] gap-2 rounded-console border border-console-border bg-console-muted p-2">
                    <StatusDot tone={stage.status === "error" ? "danger" : stage.status === "ok" ? "success" : "warning"} className="mt-1" />
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-xs font-bold text-console-text">{stage.id}</span>
                      {stage.message && <small className="block break-anywhere text-xs leading-5 text-console-subtle">{stage.message}</small>}
                    </div>
                    <span className="text-xs text-console-subtle">{formatDurationForDisplay(stage.duration)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button type="button" icon={<Copy size={16} aria-hidden="true" />} onClick={() => void copyDiagnostic(detail.summary.id)}>
                复制诊断信息
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDetail(null)}>关闭</Button>
            </div>
          </div>
        </ModalShell>
      )}
    </Panel>
  );
}
